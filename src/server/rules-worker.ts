import "dotenv/config";
import { runRulesWorkerOnce } from "./rules";
import { runWorkerLoop } from "./worker-runtime";

void runWorkerLoop("rules-worker", runRulesWorkerOnce, 30_000);
