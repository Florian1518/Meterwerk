import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// execFileSync returns stdout and throws on nonzero exit; it is not a spawnSync result.
export const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();

export function inspectContainer(containerId) {
  return JSON.parse(docker("inspect", containerId))[0];
}

export function assertHealthyContainer(container) {
  assert.equal(container.State.Running, true);
  assert.equal(container.State.Health?.Status, "healthy");
  assert.equal(container.RestartCount, 0);
}

export function stopContainer(containerId) {
  // Successful return proves exit code zero, independently of warning/stdout text.
  const output = docker("stop", "--timeout", "15", containerId);
  assert.equal(inspectContainer(containerId).State.Running, false);
  return output;
}
