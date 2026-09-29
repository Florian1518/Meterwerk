import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

assert.equal(process.env.METERWERK_ENV, "test");
assert(process.env.DEMO_PASSWORD, "Synthetic demo password required");
const version = process.env.RELEASE_VERSION ?? "0.1.0";
const archive = resolve("release-artifacts", version, "web-build.tar");
const extraction = mkdtempSync(join(tmpdir(), "meterwerk-release-smoke-"));
execFileSync("tar", ["-xf", archive, "-C", extraction]);

const server = spawn(process.execPath, [join(extraction, "start.mjs")], {
  cwd: extraction,
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: "3109",
    APP_URL: "http://127.0.0.1:3109",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
for (const stream of [server.stdout, server.stderr])
  stream.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-12000);
  });
const baseURL = "http://127.0.0.1:3109";
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt++) {
    if (server.exitCode !== null)
      throw new Error(
        `Standalone exited before readiness (code ${server.exitCode})`,
      );
    try {
      const response = await fetch(`${baseURL}/api/health/ready`, {
        signal: AbortSignal.timeout(1500),
      });
      ready = response.status === 200;
    } catch {
      await delay(500);
    }
  }
  assert(ready, `Standalone readiness timed out: ${output}`);
  execFileSync(
    process.execPath,
    ["scripts/verify-release-runtime.mjs", baseURL],
    { stdio: "inherit", env: process.env },
  );
  console.log(
    "Standalone release runtime smoke passed: liveness/readiness/login/dashboard (4 checks)",
  );
} finally {
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => server.once("exit", resolveExit)),
      delay(5000),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  rmSync(extraction, { recursive: true, force: true });
}
