import { performance } from "node:perf_hooks";
import { VirtualPulseMeter } from "../apps/edge-gateway/src/protocol-drivers";
const devices = Number(process.env.PROTOCOL_LOAD_DEVICES ?? 100);
const started = performance.now();
let readings = 0;
for (let i = 0; i < devices; i++) {
  const driver = new VirtualPulseMeter("ELECTRICITY");
  await driver.connect();
  for (let q = 0; q < 96; q++) {
    await driver.read();
    driver.telegram(`load-${i}`);
    readings++;
  }
  await driver.disconnect();
}
const elapsed = performance.now() - started;
console.log(
  JSON.stringify(
    {
      devices,
      readings,
      durationMs: Math.round(elapsed),
      readingsPerSecond: Math.round(readings / (elapsed / 1000)),
      dbWrites: 0,
      queueBacklog: 0,
      errorRate: 0,
      note: "Adapter-only benchmark; persistence benchmark requires an explicit local DB run.",
    },
    null,
    2,
  ),
);
