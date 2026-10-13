import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(realpathSync("node_modules/eslint/package.json"));
const yaml = require("js-yaml");

export function assertWorkflowSecurity(file, text) {
  const workflow = yaml.load(text);
  const publish = file === "publish-images.yml";
  assert(!/pull_request_target|write-all/.test(text));
  assert.equal(workflow.permissions?.contents, "read");
  if (publish) {
    assert.deepEqual(Object.keys(workflow.on ?? {}), ["workflow_dispatch"]);
    assert.deepEqual(workflow.permissions, {
      contents: "read",
      packages: "write",
    });
    assert.equal(workflow.jobs.quality.uses, "./.github/workflows/ci.yml");
    assert.equal(workflow.jobs.publish.needs, "quality");
  }
  for (const permissions of [
    workflow.permissions,
    ...Object.values(workflow.jobs).map((job) => job.permissions),
  ]) {
    if (permissions === undefined) continue;
    assert(permissions && typeof permissions === "object");
    assert.equal(permissions.contents, "read");
    for (const [scope, level] of Object.entries(permissions))
      assert(
        level === "read" ||
          level === "none" ||
          (publish && scope === "packages" && level === "write"),
        `${file}: forbidden permission ${scope}: ${level}`,
      );
  }
  for (const job of Object.values(workflow.jobs)) {
    assert(!job.environment, `${file}: deployment environments are forbidden`);
    for (const step of job.steps ?? []) {
      const run = step.run ?? "";
      assert(
        !/\bkubectl\b|\bhelm\b|\bdocker\s+stack\s+deploy\b|\b(?:vercel|netlify|flyctl)\s+deploy\b/i.test(
          run,
        ),
      );
      if (!publish) assert(!/\bdocker\s+(?:login|push)\b/i.test(run));
    }
  }
  for (const action of text.matchAll(/uses:\s+([^\s#]+)/g)) {
    assert(!/deploy|kubectl/i.test(action[1]));
    if (!action[1].startsWith("./")) assert.match(action[1], /@[a-f0-9]{40}$/);
  }
  assert(text.includes("persist-credentials: false"));
}
