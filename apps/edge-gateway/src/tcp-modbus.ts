import { createConnection } from "node:net";
import { randomInt } from "node:crypto";
// Holding registers 0..3: uint64 micro-kWh, big endian.
export async function readModbusEnergy(
  host = "127.0.0.1",
  port = 1502,
): Promise<bigint> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const transaction = randomInt(65536);
    const request = Buffer.alloc(12);
    request.writeUInt16BE(transaction, 0);
    request.writeUInt16BE(6, 4);
    request[6] = 1;
    request[7] = 3;
    request.writeUInt16BE(4, 10);
    let received = Buffer.alloc(0);
    socket.setTimeout(2000, () => socket.destroy(new Error("Modbus timeout")));
    socket.on("error", reject);
    socket.on("connect", () => socket.write(request));
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.length < 6) return;
      const length = received.readUInt16BE(4) + 6;
      if (length > 260) {
        socket.destroy(new Error("Invalid Modbus length"));
        return;
      }
      if (received.length < length) return;
      if (
        length !== 17 ||
        received.readUInt16BE(0) !== transaction ||
        received.readUInt16BE(2) !== 0 ||
        received[6] !== 1 ||
        received[7] !== 3 ||
        received[8] !== 8
      ) {
        socket.destroy(new Error("Invalid Modbus response"));
        return;
      }
      resolve(received.readBigUInt64BE(9));
      socket.end();
    });
    socket.on("end", () => reject(new Error("Modbus disconnected")));
  });
}
export const energyDecimal = (micro: bigint) =>
  `${micro / 1000000n}.${(micro % 1000000n).toString().padStart(6, "0")}`;
