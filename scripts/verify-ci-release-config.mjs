import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(realpathSync("node_modules/eslint/package.json"));
const yaml = require("js-yaml");
const ciText = readFileSync(".github/workflows/ci.yml", "utf8");
const releaseText = readFileSync(".github/workflows/release.yml", "utf8");
const ci = yaml.load(ciText);
const release = yaml.load(releaseText);

assert.equal(ci.permissions.contents, "read");
assert.equal(
  ci.jobs.fast.steps.some((step) => step.run === "pnpm docs:check"),
  true,
);
assert.equal(
  ci.jobs.fast.steps.some((step) => step.run === "pnpm docs:validate"),
  true,
);
for (const name of ["unit", "integration", "browser", "build"])
  assert(ci.jobs[name], `CI includes ${name} job`);
for (const text of [ciText, releaseText]) {
  assert.match(text, /pnpm\/action-setup@[a-f0-9]{40}/);
  assert.match(
    text,
    /actions\/checkout@[a-f0-9]{40}[\s\S]*?persist-credentials: false/,
  );
  for (const match of text.matchAll(/^\s+uses:\s+([^\s]+)$/gm))
    if (!match[1].startsWith("./"))
      assert.match(
        match[1],
        /@[a-f0-9]{40}(?:\s+#|$)/,
        `action is pinned: ${match[1]}`,
      );
}
assert.equal(release.permissions.contents, "read");
assert.equal(release.jobs.quality.uses, "./.github/workflows/ci.yml");
const artifactJob = release.jobs.artifact;
const runs = artifactJob.steps.map((step) => step.run ?? "").join("\n");
for (const gate of ["pnpm docs:check", "pnpm docs:validate"])
  assert(ciText.includes(gate), `CI workflow includes ${gate}`);
for (const gate of [
  "node scripts/verify-release-artifact.mjs",
  "node scripts/verify-worker-image-static.mjs",
  "node scripts/standalone-runtime-smoke.mjs",
  "docker build -f Dockerfile",
  "docker build -f Dockerfile.worker",
  "scripts/verify-web-image-runtime.mjs",
  "scripts/verify-worker-image-runtime.mjs",
  "scripts/verify-image-sbom.mjs",
])
  assert(runs.includes(gate), `Release workflow includes ${gate}`);
assert(!/docker push|docker login|kubectl apply/i.test(releaseText));
console.log(
  "CI/release static configuration passed: actions pinned, read-only permissions, docs/artifact/runtime/worker/SBOM gates present, no push/deploy",
);
