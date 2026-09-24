import { writeFile } from "node:fs/promises";

const output = process.argv[2] ?? "performance-fixture.json";
const tenants = Number(process.env.PERF_TENANTS ?? 100);
const devices = Number(process.env.PERF_DEVICES ?? 10_000);
const readingsPerMinute = Number(
  process.env.PERF_READINGS_PER_MINUTE ?? 10_000,
);
const fixture = {
  generatedAt: new Date().toISOString(),
  safeToDelete: true,
  tenants,
  properties: tenants * 10,
  meters: devices,
  devices,
  gateways: Math.ceil(devices / 100),
  readingsPerMinute,
  purpose: "Synthetic benchmark metadata only; no database writes performed.",
};
await writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
console.log(`Wrote synthetic fixture metadata to ${output}`);
