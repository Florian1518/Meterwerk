import "dotenv/config";
import { runRulesWorkerOnce } from "./rules";

async function main() {
  while (true) {
    try {
      await runRulesWorkerOnce();
    } catch (error) {
      console.error(
        "Rules worker cycle failed",
        error instanceof Error ? error.message : error,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
}

void main();
