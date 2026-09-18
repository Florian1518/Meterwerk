import { createConnection } from "node:net";
import { randomInt } from "node:crypto";
import { SerialPort } from "serialport";
import type {
  ModbusConfig,
  RegisterDefinition,
} from "../../../src/lib/modbus/contracts";
import { crc16, ModbusError, validateResponse } from "./registers";
export type RegisterReader = (register: RegisterDefinition) => Promise<Buffer>;
export function tcpRead(
  config: Extract<ModbusConfig, { interface: "TCP" }>,
  r: RegisterDefinition,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (r.address === null) {
      reject(new ModbusError("PROFILE"));
      return;
    }
    const socket = createConnection({ host: config.host, port: config.port });
    let data = Buffer.alloc(0);
    let settled = false;
    const finish = (error?: Error, result?: Buffer) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(
      () => finish(new ModbusError("TIMEOUT")),
      config.timeoutMs,
    );
    socket.once("close", () => {
      clearTimeout(timer);
      if (!settled) finish(new ModbusError("DISCONNECTED"));
    });
    socket.on("error", () => finish(new ModbusError("DISCONNECTED")));
    const transaction = randomInt(65536);
    const request = Buffer.alloc(12);
    request.writeUInt16BE(transaction, 0);
    request.writeUInt16BE(6, 4);
    request[6] = config.unitId;
    request[7] = r.functionCode;
    request.writeUInt16BE(r.address, 8);
    request.writeUInt16BE(r.length, 10);
    socket.on("connect", () => socket.write(request));
    socket.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.length > 260) {
        finish(new ModbusError("COMMUNICATION"));
        return;
      }
      if (data.length < 6) return;
      const expected = data.readUInt16BE(4) + 6;
      if (expected > 260 || expected < 9) {
        finish(new ModbusError("COMMUNICATION"));
        return;
      }
      if (data.length < expected) return;
      try {
        if (
          data.length !== expected ||
          data.readUInt16BE(0) !== transaction ||
          data.readUInt16BE(2) !== 0
        )
          throw new ModbusError("COMMUNICATION");
        finish(
          undefined,
          validateResponse(
            data.subarray(6),
            config.unitId,
            r.functionCode,
            r.length,
          ),
        );
      } catch (error) {
        finish(error as Error);
      }
    });
  });
}
export async function openTransport(
  config: ModbusConfig,
): Promise<{ read: RegisterReader; close: () => Promise<void> }> {
  if (config.interface === "TCP")
    return { read: (r) => tcpRead(config, r), close: async () => undefined };
  const port = new SerialPort({
    path: config.comPort,
    baudRate: config.baudRate,
    dataBits: config.dataBits,
    stopBits: config.stopBits,
    parity: config.parity,
    autoOpen: false,
  });
  port.on("error", () => undefined);
  await new Promise<void>((resolve, reject) =>
    port.open((error) =>
      error ? reject(new ModbusError("DISCONNECTED")) : resolve(),
    ),
  );
  return {
    read: async (r) => {
      if (r.address === null) throw new ModbusError("PROFILE");
      await new Promise<void>((resolve, reject) =>
        port.flush((error) =>
          error ? reject(new ModbusError("COMMUNICATION")) : resolve(),
        ),
      );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(2, Math.ceil(38500 / config.baudRate))),
      );
      return new Promise<Buffer>((resolve, reject) => {
        let data = Buffer.alloc(0);
        const request = Buffer.alloc(8);
        request[0] = config.slaveId;
        request[1] = r.functionCode;
        request.writeUInt16BE(r.address!, 2);
        request.writeUInt16BE(r.length, 4);
        request.writeUInt16LE(crc16(request.subarray(0, 6)), 6);
        const done = (error?: Error, value?: Buffer) => {
          clearTimeout(timer);
          port.off("data", receive);
          port.off("error", failure);
          port.off("close", failure);
          if (error) reject(error);
          else resolve(value!);
        };
        const failure = () => done(new ModbusError("DISCONNECTED"));
        const timer = setTimeout(
          () => done(new ModbusError("TIMEOUT")),
          config.timeoutMs,
        );
        const receive = (chunk: Buffer) => {
          data = Buffer.concat([data, chunk]);
          if (data.length > 256) {
            done(new ModbusError("COMMUNICATION"));
            return;
          }
          if (data.length < 3) return;
          const length = data[1] & 0x80 ? 5 : 5 + data[2];
          if (data.length < length) return;
          try {
            done(
              undefined,
              validateResponse(
                data,
                config.slaveId,
                r.functionCode,
                r.length,
                true,
              ),
            );
          } catch (error) {
            done(error as Error);
          }
        };
        port.on("data", receive);
        port.once("error", failure);
        port.once("close", failure);
        port.write(request, (error) => {
          if (error) failure();
        });
      });
    },
    close: async () => {
      if (port.isOpen)
        await new Promise<void>((resolve) => port.close(() => resolve()));
    },
  };
}
export async function listSerialPorts() {
  return (await SerialPort.list()).map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer ?? "Unbekannt",
  }));
}
