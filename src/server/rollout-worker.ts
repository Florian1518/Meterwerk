import "server-only";
import { processScheduledRollouts } from "./device-fleet-part3";
export async function runRolloutWorkerOnce() {
  return processScheduledRollouts(20);
}
