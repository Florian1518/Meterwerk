import "server-only";
import { processScheduledRollouts } from "./device-fleet-part3";
import { runWorkerLoop } from "./worker-runtime";

export async function runRolloutWorkerOnce() {
  return processScheduledRollouts(20);
}

void runWorkerLoop("rollout-worker", runRolloutWorkerOnce, 30_000);
