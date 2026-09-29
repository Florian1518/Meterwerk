import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

const version = process.env.RELEASE_VERSION ?? "0.1.0";
assert.match(version, /^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
const root = resolve("release-artifacts", version);
const metadata = JSON.parse(
  readFileSync(resolve(root, "metadata.json"), "utf8"),
);
const sbom = JSON.parse(readFileSync(resolve(root, "sbom.cdx.json"), "utf8"));
assert.equal(metadata.version, version);
assert.equal(sbom.metadata.component.version, version);
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
for (const path of entries)
  assert(
    !/(^|\/)(\.env(?:\..*)?|\.local|\.git)(\/|$)|(^|\/)\.next\/(cache|dev)(\/|$)|\.(pem|key|p12|pfx)$/.test(
      path,
    ),
    "no private/runtime files in archive",
  );
for (const worker of ["rules-worker", "mqtt-worker", "rollout-worker"])
  execFileSync(
    process.execPath,
    ["--check", resolve(root, "worker", `${worker}.js`)],
    { stdio: "pipe" },
  );
const report = {
  recordedAt: new Date().toISOString(),
  version,
  commit: metadata.commit,
  workingTree: metadata.workingTree,
  status: "PASSED",
  scope:
    "SBOM graph invariants, archive inventory, worker syntax and SHA-256; no container/runtime/signature verification",
  components: sbom.components.length,
  dependencyNodes: sbom.dependencies.length,
  checkedFiles: checksums.length,
  archiveEntries: entries.length,
  signing: metadata.signing,
};
writeFileSync(
  ".local/acceptance/resume-artifact-results.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
