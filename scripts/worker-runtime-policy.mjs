import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { relative, resolve } from "node:path";

export const forbiddenWorkerPackages = new Set([
  "tsx",
  "typescript",
  "prisma",
  "@playwright/test",
  "playwright",
  "playwright-core",
  "vitest",
  "@vitest/runner",
  "eslint",
  "esbuild",
  "@prisma/dev",
  "@prisma/config",
  "@prisma/engines",
  "@prisma/studio-core",
]);

export function runtimeFileKind(file) {
  const path = file.replaceAll("\\", "/");
  if (/(^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx)$/.test(path)) return "secret";
  const test =
    /(^|\/)(?:tests?|__tests__|__fixtures__|fixtures)(\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(
      path,
    );
  if (test)
    return path.startsWith("node_modules/")
      ? "dependency-fixture"
      : "project-test";
  return "runtime";
}

export function inspectWorkerRuntime(root) {
  const base = resolve(root);
  const files = [];
  const symlinks = [];
  function walk(directory) {
    for (const name of readdirSync(directory)) {
      const path = resolve(directory, name);
      const file = relative(base, path).replaceAll("\\", "/");
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        const target = relative(base, realpathSync(path));
        assert(
          !target.startsWith(".."),
          `Runtime symlink escapes deployment: ${file}`,
        );
        symlinks.push(file);
      } else if (stat.isDirectory()) walk(path);
      else files.push(file);
    }
  }
  walk(base);
  const packages = files
    .filter((f) => f.startsWith("node_modules/") && f.endsWith("/package.json"))
    .map((f) => ({
      ...JSON.parse(readFileSync(resolve(base, f), "utf8")),
      path: f,
    }))
    .filter((p) => p.name && p.version)
    .map(({ name, version, path }) => ({ name, version, path }));
  const devOnlyPackages = packages.filter((p) =>
    forbiddenWorkerPackages.has(p.name),
  );
  const projectTests = files.filter(
    (f) => runtimeFileKind(f) === "project-test",
  );
  const dependencyFixtures = files.filter(
    (f) => runtimeFileKind(f) === "dependency-fixture",
  );
  const secretFiles = files.filter((f) => runtimeFileKind(f) === "secret");
  const secretPatterns = [];
  for (const file of files) {
    if (!/\.(?:[cm]?js|json|md|txt|ya?ml)$/.test(file)) continue;
    const text = readFileSync(resolve(base, file), "utf8");
    const privateKeys = [
      ...text.matchAll(
        /-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g,
      ),
    ];
    if (
      privateKeys.some((m) => !m[0].includes("...")) ||
      /(?<![A-Za-z0-9+/])(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36})(?![A-Za-z0-9+/])/.test(
        text,
      )
    )
      secretPatterns.push(file);
  }
  return {
    files,
    symlinks,
    packages,
    productionPackages: packages.length,
    devOnlyPackages,
    projectTests,
    dependencyFixtures,
    secretFiles,
    secretPatterns,
  };
}

export function assertWorkerRuntime(report) {
  for (const name of [
    "devOnlyPackages",
    "projectTests",
    "secretFiles",
    "secretPatterns",
  ])
    assert.equal(
      report[name].length,
      0,
      `Worker runtime contains forbidden ${name}`,
    );
  assert.deepEqual(
    [...new Set(report.files.map((f) => f.split("/")[0]))].sort(),
    ["dist", "node_modules", "package.json", "runtime-manifest.json"],
  );
  // Dependency fixtures are inventory, not a blanket rejection of a legitimate package.
}

export function verifyWorkerDeployment(root) {
  const report = inspectWorkerRuntime(root);
  assertWorkerRuntime(report);
  const manifest = JSON.parse(
    readFileSync(resolve(root, "runtime-manifest.json"), "utf8"),
  );
  assert.equal(
    manifest.strategy,
    "locked-pnpm-install + node-file-trace deployment",
  );
  assert.deepEqual(
    [
      ...report.files.filter((f) => f !== "runtime-manifest.json"),
      ...report.symlinks,
    ].sort(),
    Object.keys(manifest.files).sort(),
    "Runtime contents match the positive deployment inventory",
  );
  for (const [file, entry] of Object.entries(manifest.files)) {
    if (entry.symlink !== undefined)
      assert.equal(readlinkSync(resolve(root, file)), entry.symlink);
    else
      assert.equal(
        sha256(readFileSync(resolve(root, file))),
        entry.sha256,
        `Runtime file hash: ${file}`,
      );
  }
  const workers = JSON.parse(
    readFileSync(resolve(root, "dist/worker-manifest.json"), "utf8"),
  );
  assert.equal(workers.commit, manifest.commit);
  for (const [file, detail] of Object.entries(workers.workers))
    assert.equal(
      sha256(readFileSync(resolve(root, "dist", file))),
      detail.sha256,
    );
  return { ...report, manifest, workers };
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
