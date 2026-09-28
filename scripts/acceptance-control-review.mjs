import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(
  await realpath(resolve("node_modules/eslint/package.json")),
);
const yaml = require("js-yaml");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const checks = [];
const record = (name) => {
  checks.push({
    name,
    status: "PASSED",
    scope: "static only; no GitHub Actions execution",
  });
  console.log(`PASS ${name}`);
};
for (const file of [
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
]) {
  const source = await readFile(file, "utf8");
  const workflow = yaml.load(source);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  for (const job of Object.values(workflow.jobs)) {
    if (job.permissions)
      assert.deepEqual(job.permissions, { contents: "read" });
    for (const step of job.steps ?? []) {
      if (step.uses && !step.uses.startsWith("./"))
        assert.match(step.uses, /@[a-f0-9]{40}$/);
      if (step.uses?.startsWith("actions/checkout@"))
        assert.equal(step.with["persist-credentials"], false);
      if (step.uses?.startsWith("pnpm/action-setup@"))
        assert.equal(`pnpm@${step.with.version}`, pkg.packageManager);
      if (step.run?.includes("pnpm install"))
        assert.match(step.run, /--frozen-lockfile/);
    }
  }
  record(
    `${file}: permissions, pinned actions, checkout credentials, pnpm version, frozen install`,
  );
  if (file.endsWith("ci.yml")) {
    const runs = (job) =>
      workflow.jobs[job].steps.map((s) => s.run ?? "").join("\n");
    assert(
      runs("integration").indexOf("pnpm db:seed") <
        runs("integration").indexOf("pnpm test:integration"),
    );
    assert(runs("integration").includes("pnpm migration:check"));
    assert(workflow.jobs.browser.services.postgres);
    assert(runs("browser").includes("pnpm start"));
    assert(runs("browser").includes("/api/health/ready"));
    assert(runs("unit").includes("pnpm db:generate"));
    assert(runs("unit").includes("pnpm security:regression"));
    record(
      "CI database fixtures, migration check, security regression and browser startup are configured",
    );
  }
}
const artifacts = [];
for (const file of [
  "release-artifacts/sbom-0.1.0.cdx.json",
  "release-artifacts/0.1.0/metadata.json",
]) {
  const bytes = await readFile(file);
  artifacts.push({
    file,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const sbom = JSON.parse(await readFile(artifacts[0].file, "utf8"));
const metadata = JSON.parse(await readFile(artifacts[1].file, "utf8"));
assert.equal(sbom.bomFormat, "CycloneDX");
assert.equal(metadata.commit, "09427c6b74c1ae3cb4355fa51ac3e6c531f1045e");
const report = {
  recordedAt: new Date().toISOString(),
  checks,
  artifacts,
  sbom: {
    components: sbom.components.length,
    versionRanges: sbom.components.filter((c) => /^[~^*><=]/.test(c.version))
      .length,
    limitation:
      "Direct package.json ranges, not a resolved transitive artifact SBOM",
  },
  release: {
    version: metadata.version,
    sha: metadata.commit,
    worktree: "dirty; not an immutable RC artifact",
    deployableWebArtifact: "NOT_EXECUTED",
    workerImage: "NOT_EXECUTED",
    signing: "NOT_EXECUTED",
    stagingGate: "NOT_EXECUTED",
  },
};
await writeFile(
  ".local/acceptance/control-review-results.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
