import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { simulatorServer } from "../apps/edge-gateway/src/simulator";
import { faultSchema } from "../src/lib/modbus/contracts";
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
let energyWork = Promise.resolve(total);
const server = simulatorServer({
  fault: async () => {
    try {
      return faultSchema.parse(
        JSON.parse(await readFile(".local/simulator-fault.json", "utf8")).fault,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return "NONE";
    }
  },
  energy: () => {
    energyWork = energyWork.then(async () => {
      const now = Date.now();
      total += (BigInt(now - previous) * 1000n) / 3600n;
      previous = now;
      await writeFile(`${file}.tmp`, total.toString());
      await rename(`${file}.tmp`, file);
      return total;
    });
    return energyWork;
  },
});
server.listen(
  Number(process.env.MODBUS_SIMULATOR_PORT ?? 1502),
  "127.0.0.1",
  () => console.log("Modbus simulator ready"),
);
