import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { assertWorkerStopped } from "./worker-image-lifecycle.mjs";

test("Argon2 Docker CLI copies the locked native binding into a fresh destination", () => {
  const destination = mkdtempSync(join(tmpdir(), "meterwerk-argon2-cli-"));
  try {
    const output = execFileSync(
      process.execPath,
      ["scripts/copy-argon2-runtime.mjs", destination],
      { encoding: "utf8" },
    );
    assert.match(output, /Included @node-rs\/argon2-/);
    const scope = join(destination, "node_modules/@node-rs");
    const packages = readdirSync(scope);
    assert.equal(packages.length, 1);
    const installed = join(scope, packages[0]);
    const metadata = JSON.parse(readFileSync(join(installed, "package.json")));
    const parent = JSON.parse(
      readFileSync("node_modules/@node-rs/argon2/package.json"),
    );
    assert.equal(metadata.version, parent.optionalDependencies[metadata.name]);
    const binding = readdirSync(installed).find((file) =>
      file.endsWith(".node"),
    );
    assert(binding, "CLI actually copied the native binary");
    const source = resolve(
      "node_modules/.pnpm",
      `${metadata.name.replaceAll("/", "+")}@${metadata.version}`,
      "node_modules",
      metadata.name,
      binding,
    );
    const digest = (path) =>
      createHash("sha256").update(readFileSync(path)).digest("hex");
    assert.equal(digest(join(installed, binding)), digest(source));
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
});

test("all three actual worker stop messages are accepted", () => {
  for (const worker of ["rules-worker", "rollout-worker", "mqtt-worker"])
    assertWorkerStopped(
      worker,
      { Running: false, ExitCode: 0 },
      worker === "mqtt-worker"
        ? '{"event":"worker.stopped"}'
        : `${worker} started\n${worker} stopped`,
    );
});

test("a forced kill is rejected even with a stop log", () => {
  assert.throws(() =>
    assertWorkerStopped(
      "rules-worker",
      { Running: false, ExitCode: 137 },
      "rules-worker stopped",
    ),
  );
});

test("a running process is rejected even with a stop log", () => {
  assert.throws(() =>
    assertWorkerStopped(
      "rollout-worker",
      { Running: true, ExitCode: 0 },
      "rollout-worker stopped",
    ),
  );
});

test("exit zero without the matching worker shutdown message is rejected", () => {
  for (const worker of ["rules-worker", "rollout-worker", "mqtt-worker"])
    assert.throws(() =>
      assertWorkerStopped(
        worker,
        { Running: false, ExitCode: 0 },
        "unrelated process stopped",
      ),
    );
});
