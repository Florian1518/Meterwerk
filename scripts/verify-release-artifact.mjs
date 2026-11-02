import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { verifySourceState } from "./source-state.mjs";

const version = process.env.RELEASE_VERSION ?? "0.1.0";
assert.match(version, /^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
const root = resolve("release-artifacts", version);
// The default verifier is the complete release gate. The explicitly named
// preparation mode cannot approve a release and runs before images exist.
if (!process.argv.includes("--pre-image")) {
  const expectedSha =
    process.env.GITHUB_SHA ??
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  execFileSync(
    process.execPath,
    ["scripts/verify-promotion.mjs", "release-artifacts", expectedSha, version],
    { stdio: "inherit" },
  );
  process.exit(0);
}
const metadata = JSON.parse(
  readFileSync(resolve(root, "metadata.json"), "utf8"),
);
const sbom = JSON.parse(readFileSync(resolve(root, "sbom.cdx.json"), "utf8"));
const workerManifest = JSON.parse(
  readFileSync(resolve(root, "worker/worker-manifest.json"), "utf8"),
);
assert.equal(metadata.version, version);
assert.equal(sbom.metadata.component.version, version);
assert.match(metadata.commit, /^[a-f0-9]{40}$/);
assert.equal(
  metadata.commit,
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
);
verifySourceState(metadata.sourceState, metadata.commit);
assert.equal(metadata.workingTree, metadata.sourceState.workingTree);
assert.equal(workerManifest.commit, metadata.commit);
assert.equal(
  workerManifest.lockfileSha256,
  sbom.metadata.properties.find((p) => p.name === "pnpm.lockfile.sha256")
    ?.value,
);
assert.equal(Object.keys(workerManifest.workers).length, 3);
const lockfileSha256 = createHash("sha256")
  .update(readFileSync("pnpm-lock.yaml"))
  .digest("hex");
assert.equal(metadata.provenance.gitSha, metadata.commit);
assert.equal(metadata.provenance.lockfile.sha256, lockfileSha256);
assert.equal(metadata.provenance.sbom.components, sbom.components.length);
assert.equal(
  metadata.provenance.sbom.dependencyNodes,
  sbom.dependencies.length,
);
assert.equal(
  metadata.provenance.artifactVerifier.command,
  "node scripts/verify-release-artifact.mjs",
);
assert(
  ["NOT_RUN", "PASSED"].includes(metadata.provenance.artifactVerifier.status),
);
if (metadata.provenance.artifactVerifier.status === "PASSED")
  assert.equal(metadata.provenance.artifactVerifier.exitCode, 0);
const audit = JSON.parse(
  readFileSync(resolve(root, metadata.provenance.dependencyAudit.file), "utf8"),
);
assert.equal(audit.status, "PASSED");
assert.equal(audit.exitCode, 0);
assert.equal(audit.lockfile.sha256, lockfileSha256);
assert.equal(metadata.provenance.dependencyAudit.gitSha, audit.gitSha);
assert(
  ["critical", "high", "moderate", "low", "info"].every(
    (severity) => audit.advisories[severity] === 0,
  ),
  "recorded dependency audit has no advisories",
);
const known = new Set([
  sbom.metadata.component["bom-ref"],
  ...sbom.components.map((c) => c["bom-ref"]),
]);
assert.equal(known.size, sbom.components.length + 1, "unique component refs");
for (const component of sbom.components) {
  assert.match(component.version, /^\d+\.\d+\.\d+/);
  assert.equal(component.purl, component["bom-ref"]);
}
for (const dependency of sbom.dependencies) {
  assert(known.has(dependency.ref), "known parent");
  for (const ref of dependency.dependsOn) assert(known.has(ref), "known child");
}
assert(
  sbom.dependencies.some(
    (d) =>
      d.ref === sbom.metadata.component["bom-ref"] && d.dependsOn.length > 0,
  ),
);
const checksums = readFileSync(resolve(root, "checksums.sha256"), "utf8")
  .trim()
  .split("\n");
const checked = new Set();
for (const line of checksums) {
  const match = /^([a-f0-9]{64})  ([^\r\n]+)$/.exec(line);
  assert(match, "checksum format");
  const path = resolve(root, match[2]);
  assert(!relative(root, path).startsWith(".."), "contained artifact");
  assert(!checked.has(match[2]), "unique checksum entry");
  checked.add(match[2]);
  assert.equal(
    createHash("sha256").update(readFileSync(path)).digest("hex"),
    match[1],
  );
}
function inventory(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory()
      ? inventory(path)
      : [relative(root, path).replaceAll("\\", "/")];
  });
}
assert.deepEqual(
  [...checked].sort(),
  inventory(root)
    .filter((p) => p !== "checksums.sha256")
    .sort(),
);
const entries = execFileSync("tar", ["-tf", resolve(root, "web-build.tar")], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
})
  .trim()
  .split(/\r?\n/)
  .map((p) => p.replace(/^\.\//, ""));
for (const required of [
  "server.js",
  "start.mjs",
  "runtime-links.json",
  ".next/BUILD_ID",
  "package.json",
  "pnpm-lock.yaml",
  "prisma/schema.prisma",
  "scripts/verify-migration-baseline.mjs",
])
  assert(entries.includes(required), `archive contains ${required}`);
assert(
  entries.some(
    (p) => p.startsWith("node_modules/@node-rs/argon2-") && p.endsWith(".node"),
  ),
  "archive contains a native Argon2 binding for its build platform",
);
for (const path of entries)
  assert(
    !/(^|\/)(\.env(?:\..*)?|\.local|\.git)(\/|$)|(^|\/)\.next\/(cache|dev)(\/|$)|\.(pem|key|p12|pfx)$/.test(
      path,
    ),
    "no private/runtime files in archive",
  );
const archiveBytes = readFileSync(resolve(root, "web-build.tar"));
for (const secret of [
  ...[
    "SESSION_SECRET",
    "MFA_ENCRYPTION_KEY",
    "WEBHOOK_SECRET_ENCRYPTION_KEY",
    "DEMO_PASSWORD",
  ].map((name) => process.env[name]),
  "ci-only-synthetic-session-secret",
  "ci-only-synthetic-mfa-key-32-bytes",
  "ci-only-synthetic-demo-password",
].filter((value) => value && value.length >= 8))
  assert(
    !archiveBytes.includes(Buffer.from(secret)),
    "Test credential found in release archive",
  );
for (const worker of ["rules-worker", "mqtt-worker", "rollout-worker"]) {
  const file = resolve(root, "worker", `${worker}.js`);
  const manifest = workerManifest.workers[`${worker}.js`];
  assert(manifest, `worker manifest contains ${worker}`);
  assert.equal(
    createHash("sha256").update(readFileSync(file)).digest("hex"),
    manifest.sha256,
    `${worker} hash matches worker manifest`,
  );
  assert(!readFileSync(file, "utf8").includes("sourceMappingURL"));
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}
const report = {
  recordedAt: new Date().toISOString(),
  version,
  commit: metadata.commit,
  workingTree: metadata.workingTree,
  status: "PASSED",
  scope:
    "SBOM graph invariants, archive inventory, platform-native Argon2, worker manifest/syntax/hashes and artifact SHA-256; no container/runtime/signature verification",
  components: sbom.components.length,
  dependencyNodes: sbom.dependencies.length,
  checkedFiles: checksums.length,
  archiveEntries: entries.length,
  workerBundles: Object.keys(workerManifest.workers).length,
  signing: metadata.signing,
};
metadata.provenance.artifactVerifier = {
  command: "node scripts/verify-release-artifact.mjs",
  status: "PASSED",
  exitCode: 0,
  checkedFiles: checksums.length,
  archiveEntries: entries.length,
};
writeFileSync(
  resolve(root, "metadata.json"),
  JSON.stringify(metadata, null, 2),
);
function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
writeFileSync(
  resolve(root, "checksums.sha256"),
  files(root)
    .filter((path) => !path.endsWith("checksums.sha256"))
    .map(
      (path) =>
        `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${relative(root, path).replaceAll("\\", "/")}`,
    )
    .sort()
    .join("\n") + "\n",
);
const reportPath = ".local/acceptance/resume-artifact-results.json";
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
