import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(realpathSync("node_modules/eslint/package.json"));
const yaml = require("js-yaml");

function assertThreeImagePublish(workflow) {
  const job = workflow.jobs.publish;
  assert.equal(job.env.GIT_COMMIT_SHA, "${{ github.sha }}");
  assert(!job["continue-on-error"]);
  const steps = job.steps;
  const runs = steps.map((step) =>
    (step.run ?? "").replace(/\\\r?\n\s*/g, " "),
  );
  const allRuns = runs.join("\n");
  const login = runs.findIndex((run) => /\bdocker login\b/.test(run));
  assert(
    login >= 0,
    "Manual publish requires a registry login after the gates",
  );
  assert.equal(runs.filter((run) => /\bdocker login\b/.test(run)).length, 1);
  assert.match(
    runs[login],
    /docker login ghcr\.io --username "\$GITHUB_ACTOR" --password-stdin/,
  );
  const checkout = steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  assert.equal(checkout?.with?.ref, "${{ github.sha }}");
  for (const env of [workflow.env, job.env, ...steps.map((step) => step.env)])
    assert(
      !env || !("GITHUB_SHA" in env),
      "Do not override the immutable GitHub SHA",
    );
  assert.doesNotMatch(allRuns, /(?:^|[;\n])\s*(?:export\s+)?GITHUB_SHA=/);

  const images = ["web", "worker", "migrations"];
  const pushes = [...allRuns.matchAll(/^\s*docker push "([^"]+)"\s*$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    pushes,
    images.map((name) => `ghcr.io/florian1518/meterwerk-${name}:$GITHUB_SHA`),
    "Only the three approved repositories with commit-SHA tags may be pushed",
  );
  assert.equal([...allRuns.matchAll(/\bdocker\s+push\b/g)].length, 3);
  const tags = [
    ...allRuns.matchAll(/^\s*docker tag "([^"]+)" "([^"]+)"\s*$/gm),
  ].map((match) => match.slice(1));
  assert.deepEqual(
    tags,
    images.map((name) => [
      `meterwerk-${name}:$GITHUB_SHA`,
      `ghcr.io/florian1518/meterwerk-${name}:$GITHUB_SHA`,
    ]),
  );
  const builds = [...allRuns.matchAll(/^\s*docker build (.+)$/gm)].map(
    (match) => match[1],
  );
  assert.equal(builds.length, 3);
  for (const [index, name] of images.entries()) {
    const dockerfile = name === "web" ? "Dockerfile" : `Dockerfile.${name}`;
    assert(
      builds[index].startsWith(`-f ${dockerfile} `),
      `${name}: correct Dockerfile required`,
    );
    assert(
      builds[index].includes('--build-arg GIT_SHA="$GITHUB_SHA"'),
      `${name}: revision build argument required`,
    );
    assert(
      builds[index].includes(`-t "meterwerk-${name}:$GITHUB_SHA" .`),
      `${name}: exact commit-SHA build tag required`,
    );
  }
  assert(builds[0].includes("--build-arg NEXT_PUBLIC_METERWERK_ENV=staging"));
  const gates = [
    "node scripts/verify-release-artifact.mjs",
    "node scripts/verify-worker-image-static.mjs",
    "docker build -f Dockerfile ",
    "docker build -f Dockerfile.worker ",
    "docker build -f Dockerfile.migrations ",
    "node node_modules/prisma/build/index.js generate && node node_modules/prisma/build/index.js --version",
    "node scripts/verify-migration-baseline.mjs && node node_modules/prisma/build/index.js migrate deploy && node node_modules/prisma/build/index.js migrate status",
    "node scripts/verify-web-image-runtime.mjs",
    "node scripts/verify-worker-image-runtime.mjs",
  ];
  for (const gate of gates) {
    const index = runs.findIndex((run) => run.includes(gate));
    assert(
      index >= 0 && index < login,
      `Required gate must precede registry login: ${gate}`,
    );
    assert(
      !steps[index].if && !steps[index]["continue-on-error"],
      "Publish gates must not be skipped or ignored",
    );
    assert.doesNotMatch(
      runs[index],
      /\|\|\s*(?:true|:)|\bset\s+\+e\b/,
      "Do not swallow a publish gate failure",
    );
  }
  for (const [index, run] of runs.entries())
    if (/\bdocker\s+(?:tag|push)\b/.test(run))
      assert(index > login, "Tag/push must follow checks and login");
  for (const [name, other] of Object.entries(workflow.jobs))
    if (name !== "publish")
      for (const step of other.steps ?? [])
        assert.doesNotMatch(
          step.run ?? "",
          /\bdocker\s+(?:login|push)\b/,
          "Registry mutations belong only in the gated publish job",
        );
}

export function assertWorkflowSecurity(file, text) {
  const workflow = yaml.load(text);
  const publish = file === "publish-images.yml";
  assert(!/pull_request_target|write-all/.test(text));
  assert.equal(workflow.permissions?.contents, "read");
  if (publish) {
    assert.deepEqual(Object.keys(workflow.on ?? {}), [
      "workflow_dispatch",
      "workflow_call",
    ]);
    assert.deepEqual(workflow.permissions, { contents: "read" });
    assert.equal(workflow.jobs.quality.uses, "./.github/workflows/ci.yml");
    assert.equal(workflow.jobs.publish.needs, "quality");
    assertThreeImagePublish(workflow);
    const steps = workflow.jobs.publish.steps;
    for (const command of [
      "node scripts/source-state.mjs",
      "bash scripts/install-supply-chain-tools.sh",
      "node scripts/scan-release-images.mjs",
      "node scripts/finalize-release-manifest.mjs",
      "node scripts/verify-promotion.mjs",
    ]) {
      const step = steps.find((item) => item.run?.includes(command));
      assert(
        step && !step.if && !step["continue-on-error"],
        `Mandatory security gate: ${command}`,
      );
      assert.doesNotMatch(step.run, /\|\|\s*(?:true|:)|\bset\s+\+e\b/);
    }
    assert(
      steps.findIndex((step) => step.run?.includes("source-state.mjs")) <
        steps.findIndex((step) => step.run?.includes("pnpm install")),
    );
    for (const role of ["web", "worker", "migrations"]) {
      for (const type of ["provenance", "sbom"]) {
        const step = steps.find((item) => item.id === `${type}_${role}`);
        assert(step && !step.if && !step["continue-on-error"]);
        assert.equal(
          step.with["subject-name"],
          `ghcr.io/florian1518/meterwerk-${role}`,
        );
        assert.equal(
          step.with["subject-digest"],
          `\${{ steps.security.outputs.${role}_digest }}`,
        );
        assert.equal(step.with["push-to-registry"], true);
      }
    }
  }
  if (file === "release.yml") {
    assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
    assert.deepEqual(Object.keys(workflow.jobs), ["artifact"]);
    assert.equal(
      workflow.jobs.artifact.uses,
      "./.github/workflows/publish-images.yml",
    );
    assert(!workflow.jobs.artifact.steps);
    assert.deepEqual(workflow.permissions, { contents: "read" });
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
          ((publish || file === "release.yml") &&
            ["packages", "id-token", "attestations"].includes(scope) &&
            level === "write"),
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
      if (!publish) {
        assert(!/\bdocker\s+push\b/i.test(run));
        if (/\bdocker\s+login\b/i.test(run)) {
          assert.equal(file, "image-vulnerabilities.yml");
          assert.equal(
            run,
            'printf \'%s\' "$GH_TOKEN" | docker login ghcr.io --username "$GITHUB_ACTOR" --password-stdin',
          );
        }
      }
    }
  }
  for (const action of text.matchAll(/uses:\s+([^\s#]+)/g)) {
    assert(!/deploy|kubectl/i.test(action[1]));
    if (!action[1].startsWith("./")) assert.match(action[1], /@[a-f0-9]{40}$/);
  }
  if (file !== "release.yml")
    assert(text.includes("persist-credentials: false"));
}
