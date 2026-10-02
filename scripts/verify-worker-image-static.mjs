import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";

const require = createRequire(realpathSync("node_modules/eslint/package.json"));
const yaml = require("js-yaml");
const version = process.env.RELEASE_VERSION ?? "0.1.0";
const artifactRoot = resolve("release-artifacts", version);
const workerOnly = process.argv.includes("--worker-only");
const workersRoot = resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
    artifactRoot + "/worker",
);
const workerDockerfile = readFileSync("Dockerfile.worker", "utf8");
const webDockerfile = readFileSync("Dockerfile", "utf8");
const dockerignore = readFileSync(".dockerignore", "utf8");
const lock = yaml
  .loadAll(readFileSync("pnpm-lock.yaml", "utf8"))
  .find(
    (document) => document.importers?.["."]?.dependencies && document.snapshots,
  );
assert(lock, "pnpm lockfile contains its application dependency graph");

assert.match(workerDockerfile, /^FROM node:22-alpine AS build-deps$/m);
assert.match(workerDockerfile, /^FROM node:22-alpine AS worker-build$/m);
assert.match(workerDockerfile, /^FROM worker-build AS runtime-deps$/m);
assert.match(workerDockerfile, /^FROM node:22-alpine AS runtime$/m);
assert.match(workerDockerfile, /pnpm install --frozen-lockfile/);
assert.match(
  workerDockerfile,
  /node scripts\/deploy-worker-runtime\.mjs \/app\/worker-runtime/,
);
assert.match(workerDockerfile, /node scripts\/build-worker-bundles\.mjs/);
const runtimeStage = workerDockerfile.split(/^FROM /m).at(-1);
assert.match(runtimeStage, /^node:22-alpine AS runtime/m);
assert.doesNotMatch(
  runtimeStage,
  /tsx|pnpm|npm install|COPY.+(?:tests|\.env|\.pem|\.key)/i,
);
assert.match(runtimeStage, /COPY --from=runtime-deps.+\/app\/worker-runtime/);
assert.doesNotMatch(
  runtimeStage,
  /COPY --from=(?:build-deps|worker-build).+node_modules/,
);
assert.doesNotMatch(runtimeStage, /COPY.*\/app\/node_modules/);
assert.match(runtimeStage, /USER meterwerk/);
assert.match(
  runtimeStage,
  /ENTRYPOINT \["node", "--conditions=react-server"\]/,
);
assert.match(runtimeStage, /CMD \["dist\/rules-worker\.js"\]/);
assert.match(
  runtimeStage,
  /org\.opencontainers\.image\.base\.name=node:22-alpine/,
);
assert.doesNotMatch(
  webDockerfile,
  /COPY --from=builder.+\/app\/node_modules \.\/node_modules/,
);
assert.match(webDockerfile, /copy-argon2-runtime\.mjs/);
assert.match(
  webDockerfile,
  /org\.opencontainers\.image\.base\.name=node:22-alpine/,
);
for (const required of [
  "node_modules",
  ".git",
  ".local",
  ".env*",
  "*.pem",
  "*.key",
])
  assert(
    dockerignore.split(/\r?\n/).includes(required),
    `Docker context excludes ${required}`,
  );

const checksums = workerOnly
  ? null
  : readFileSync(resolve(artifactRoot, "checksums.sha256"), "utf8");
const metadata = workerOnly
  ? null
  : JSON.parse(readFileSync(resolve(artifactRoot, "metadata.json"), "utf8"));
const sbom = workerOnly
  ? null
  : JSON.parse(readFileSync(resolve(artifactRoot, "sbom.cdx.json"), "utf8"));
const manifest = JSON.parse(
  readFileSync(resolve(workersRoot, "worker-manifest.json"), "utf8"),
);
if (!workerOnly) assert.equal(manifest.commit, metadata.commit);
assert.equal(
  manifest.lockfileSha256,
  createHash("sha256").update(readFileSync("pnpm-lock.yaml")).digest("hex"),
);
if (!workerOnly)
  assert.equal(
    sbom.metadata.properties.find((p) => p.name === "pnpm.lockfile.sha256")
      ?.value,
    manifest.lockfileSha256,
  );
assert.equal(manifest.target, "node22-linux-alpine");
assert.deepEqual(Object.keys(manifest.workers).sort(), [
  "mqtt-worker.js",
  "rollout-worker.js",
  "rules-worker.js",
]);

function packageName(specifier) {
  if (specifier.startsWith("@"))
    return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}
const importer = lock.importers["."];
const productionPackages = new Set();
const visited = new Set();
function visit(name, reference) {
  const raw = String(reference);
  if (/^(link:|file:|workspace:)/.test(raw)) return;
  const version = raw.split("(")[0];
  const identity = `${name}@${version}`;
  if (visited.has(identity)) return;
  visited.add(identity);
  productionPackages.add(name);
  const prefix = `${name}@${version}`;
  const snapshotKey = Object.keys(lock.snapshots).find(
    (key) => key === prefix || key.startsWith(`${prefix}(`),
  );
  assert(
    snapshotKey,
    `Production dependency missing from lock snapshots: ${identity}`,
  );
  const snapshot = lock.snapshots[snapshotKey];
  for (const [dependency, resolved] of Object.entries({
    ...snapshot.dependencies,
    ...snapshot.optionalDependencies,
  }))
    visit(dependency, resolved);
}
for (const [name, entry] of Object.entries({
  ...importer.dependencies,
  ...importer.optionalDependencies,
}))
  visit(name, entry.version);
assert(
  !productionPackages.has("tsx"),
  "tsx must not be in the production dependency closure",
);
for (const native of [
  "@node-rs/argon2-linux-x64-musl",
  "@node-rs/argon2-linux-arm64-musl",
])
  assert(
    productionPackages.has(native),
    `Native optional runtime binding missing from production lock closure: ${native}`,
  );

const filenames = readdirSync(workersRoot).sort();
assert.deepEqual(filenames, [
  "mqtt-worker.js",
  "rollout-worker.js",
  "rules-worker.js",
  "worker-manifest.json",
]);
for (const [file, detail] of Object.entries(manifest.workers)) {
  const path = resolve(workersRoot, file);
  assert(!relative(workersRoot, path).startsWith(".."));
  const bytes = readFileSync(path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), detail.sha256);
  assert(
    !bytes.toString("utf8").includes("sourceMappingURL"),
    `${file} has no source map reference`,
  );
  for (const external of detail.externalImports)
    assert(
      productionPackages.has(packageName(external)),
      `${file} external runtime package is not in production closure: ${external}`,
    );
  if (!workerOnly)
    assert(
      checksums.includes(`  worker/${file}\n`),
      `${file} is covered by release checksums`,
    );
}
for (const name of filenames)
  assert(
    !/(^|\.)(?:env(?:\.|$)|git|pem|key|p12|pfx|test|spec)(?:$|\.)/i.test(name),
    `No secret/test artifact: ${name}`,
  );
if (!workerOnly) assert(checksums.includes("  worker/worker-manifest.json\n"));
console.log(
  `Worker image static verification passed: 4 stages, traced deployment (input lock graph ${productionPackages.size} packages), 3 bundles, 0 source maps; ${workerOnly ? "worker-only check; previous Web release artifacts not revalidated" : "release metadata/SBOM/checksums present"}`,
);
