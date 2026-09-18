import { writeFile, mkdir } from "node:fs/promises";
import { faultSchema } from "../src/lib/modbus/contracts";
const fault = faultSchema.parse(process.argv[2] ?? "NONE");
await mkdir(".local", { recursive: true });
await writeFile(".local/simulator-fault.json", JSON.stringify({ fault }));
console.log(`Simulator fault: ${fault}`);
