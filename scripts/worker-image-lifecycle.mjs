import assert from "node:assert/strict";

export function assertWorkerStopped(worker, state, output) {
  assert.equal(state.Running, false, `${worker} stopped`);
  assert.equal(state.ExitCode, 0, `${worker} exited successfully`);
  assert.match(
    output,
    worker === "mqtt-worker"
      ? /worker\.stopped/
      : new RegExp(`${worker} stopped`),
    `${worker} shut down gracefully`,
  );
}
