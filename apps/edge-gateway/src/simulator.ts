import { createServer } from "node:net";
import {
  getProfile,
  type SimulatorFault,
} from "../../../src/lib/modbus/contracts";
const examples: Record<string, number> = {
  energyExport: 250,
  powerTotal: 1000,
  powerL1: 330,
  powerL2: 335,
  powerL3: 335,
  voltageL1: 230,
  voltageL2: 231,
  voltageL3: 229,
  currentL1: 1.5,
  currentL2: 1.5,
  currentL3: 1.5,
  frequency: 50,
  powerFactor: 0.98,
};
export function simulatorServer(options: {
  fault: () => Promise<SimulatorFault>;
  energy: () => Promise<bigint>;
  slaveId?: number;
}) {
  const profile = getProfile("simulator-three-phase-v1");
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let handled = false;
    socket.setTimeout(12000, () => socket.destroy());
    socket.on("error", () => undefined);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 260) {
        socket.destroy();
        return;
      }
      if (buffer.length < 12 || handled) return;
      handled = true;
      void (async () => {
        const request = buffer.subarray(0, 12);
        const fault = await options.fault();
        if (fault === "TIMEOUT" || request[6] !== (options.slaveId ?? 1))
          return;
        if (fault === "DISCONNECTED") {
          socket.destroy();
          return;
        }
        if (request.readUInt16BE(2) !== 0 || request.readUInt16BE(4) !== 6) {
          socket.destroy();
          return;
        }
        const register = profile.registers.find(
          (r) =>
            r.address === request.readUInt16BE(8) &&
            r.length === request.readUInt16BE(10) &&
            r.functionCode === request[7],
        );
        let pdu: Buffer;
        if (!register || fault === "INVALID_REGISTER")
          pdu = Buffer.from([request[6], request[7] | 0x80, 2]);
        else {
          const bytes = Buffer.alloc(register.length * 2);
          if (register.metric === "energyImport")
            bytes.writeBigUInt64BE(await options.energy());
          else
            bytes.writeFloatBE(
              fault === "UNREALISTIC" && register.metric === "voltageL1"
                ? 99999
                : examples[register.metric],
            );
          pdu = Buffer.concat([
            Buffer.from([
              fault === "WRONG_SLAVE" ? 2 : request[6],
              request[7],
              bytes.length,
            ]),
            bytes,
          ]);
        }
        const header = Buffer.alloc(6);
        request.copy(header, 0, 0, 2);
        header.writeUInt16BE(fault === "COMMUNICATION" ? 1 : 0, 2);
        header.writeUInt16BE(pdu.length, 4);
        socket.end(Buffer.concat([header, pdu]));
      })().catch(() => socket.destroy());
    });
  });
  return server;
}
