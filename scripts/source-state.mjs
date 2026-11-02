import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function captureSourceState(cwd = process.cwd()) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const status = git("status", "--porcelain=v1", "--untracked-files=all");
  return {
    schemaVersion: 1,
    commit: git("rev-parse", "HEAD").trim(),
    tree: git("rev-parse", "HEAD^{tree}").trim(),
    capturedAt: new Date().toISOString(),
    workingTree: status.length ? "dirty" : "clean",
    // Do not expose filenames or source diffs that could contain secrets.
    statusSha256: createHash("sha256").update(status).digest("hex"),
    statusEntries: status.split("\n").filter(Boolean).length,
    command: "git status --porcelain=v1 --untracked-files=all",
  };
}

export function verifySourceState(state, commit, requireClean = true) {
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.commit, commit);
  assert.match(state.tree, /^[a-f0-9]{40}$/);
  assert(Number.isFinite(Date.parse(state.capturedAt)));
  assert.equal(
    state.command,
    "git status --porcelain=v1 --untracked-files=all",
  );
  assert(Number.isSafeInteger(state.statusEntries) && state.statusEntries >= 0);
  assert.match(state.statusSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    state.workingTree,
    state.statusEntries === 0 ? "clean" : "dirty",
  );
  if (state.workingTree === "clean")
    assert.equal(
      state.statusSha256,
      createHash("sha256").update("").digest("hex"),
    );
  if (requireClean) assert.equal(state.workingTree, "clean");
  return state;
}

export function readSourceState(commit) {
  assert(
    process.env.SOURCE_STATE_FILE,
    "Capture source state before generating artifacts",
  );
  return verifySourceState(
    JSON.parse(readFileSync(process.env.SOURCE_STATE_FILE, "utf8")),
    commit,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const output = resolve(process.argv[2] ?? ".local/source-state.json");
  const state = captureSourceState();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(state, null, 2) + "\n");
  console.log(
    `Source workingTree=${state.workingTree}; commit=${state.commit}`,
  );
  if (process.env.CI === "true")
    verifySourceState(state, process.env.GITHUB_SHA);
}
