import "server-only";
import { db } from "./db";

export async function runWorkerLoop(
  name: string,
  runOnce: () => Promise<unknown>,
  intervalMs: number,
) {
  let stopping = false;
  let wakeDelay = () => {};
  const requestStop = () => {
    stopping = true;
    wakeDelay();
  };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  console.info(`${name} started`);

  try {
    while (!stopping) {
      try {
        await runOnce();
      } catch (error) {
        console.error(
          `${name} cycle failed`,
          error instanceof Error ? error.name : "UnknownError",
        );
      }
      if (stopping) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, intervalMs);
        wakeDelay = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      wakeDelay = () => {};
    }
  } finally {
    process.off("SIGINT", requestStop);
    process.off("SIGTERM", requestStop);
    await db.$disconnect();
    console.info(`${name} stopped`);
  }
}
