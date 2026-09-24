import "server-only";
import { processScheduledRollouts } from "./device-fleet-part3";
export async function runRolloutWorkerOnce() {
  return processScheduledRollouts(20);
}
if (process.env.RUN_WORKER === "true") {
  while (true) {
    await runRolloutWorkerOnce();
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
}
