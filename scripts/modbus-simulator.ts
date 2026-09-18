import { createServer } from "node:net";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
await mkdir(".local", { recursive: true });
const file = ".local/modbus-energy.txt";
let total: bigint;
try {
  total = BigInt(await readFile(file, "utf8"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  total = 12000000000n;
}
let previous = Date.now();
let pending = Promise.resolve();
const server = createServer((socket) => {
  let buffer = Buffer.alloc(0);
  socket.on("error", () => undefined);
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 260) {
      socket.destroy();
      return;
    }
    while (buffer.length >= 12) {
      const request = Buffer.from(buffer.subarray(0, 12));
      buffer = buffer.subarray(12);
      pending = pending
        .then(async () => {
          if (
            request.readUInt16BE(2) !== 0 ||
            request.readUInt16BE(4) !== 6 ||
            request[6] !== 1 ||
            request[7] !== 3 ||
            request.readUInt16BE(8) !== 0 ||
            request.readUInt16BE(10) !== 4
          ) {
            socket.destroy();
            return;
          }
          const now = Date.now();
          total += (BigInt(now - previous) * 1000n) / 3600n;
          previous = now;
          await writeFile(`${file}.tmp`, total.toString());
          await rename(`${file}.tmp`, file);
          const response = Buffer.alloc(17);
          request.copy(response, 0, 0, 4);
          response.writeUInt16BE(11, 4);
          response[6] = 1;
          response[7] = 3;
          response[8] = 8;
          response.writeBigUInt64BE(total, 9);
          socket.end(response);
        })
        .catch(() => {
          console.error("Simulator persistence failed");
          socket.destroy();
        });
    }
  });
});
server.listen(1502, "127.0.0.1", () =>
  console.log("Modbus simulator listening on 127.0.0.1:1502"),
);
