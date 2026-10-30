import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  roles,
  json,
  repository,
  vulnerabilitySummary,
} from "./release-manifest.mjs";

const run = (args) =>
  execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const policy = json("infra/supported-releases.json");
assert(policy.lanes.length > 0, "No supported releases configured");
const reports = resolve("release-artifacts/recurring");
mkdirSync(reports, { recursive: true });
let failed = false;
for (const lane of policy.lanes) {
  assert.match(lane.branch, /^[a-zA-Z0-9/._-]+$/);
  const runs = JSON.parse(
    run([
      "api",
      `repos/${repository}/actions/workflows/release.yml/runs?branch=${encodeURIComponent(lane.branch)}&status=success&event=workflow_dispatch&per_page=1`,
    ]),
  );
  const accepted = runs.workflow_runs[0];
  assert(accepted, `No accepted release for ${lane.branch}`);
  const destination = resolve(
    process.env.RUNNER_TEMP,
    `supported-${accepted.id}`,
  );
  run([
    "run",
    "download",
    String(accepted.id),
    "--repo",
    repository,
    "--name",
    "release-artifact",
    "--dir",
    destination,
  ]);
  execFileSync(
    process.execPath,
    [
      "scripts/verify-promotion.mjs",
      destination,
      accepted.head_sha,
      lane.version,
    ],
    { stdio: "inherit" },
  );
  const manifest = json(resolve(destination, "release-manifest.json"));
  for (const role of roles) {
    const file = resolve(reports, `${accepted.id}-${role}.json`);
    execFileSync(
      "grype",
      [
        `registry:${manifest.images[role].reference}`,
        "-o",
        "json",
        "--file",
        file,
      ],
      { stdio: "inherit" },
    );
    try {
      vulnerabilitySummary(json(file), manifest.images[role].reference);
    } catch {
      failed = true;
    }
  }
  writeFileSync(
    resolve(reports, `${accepted.id}-source.json`),
    JSON.stringify(
      {
        run: accepted.id,
        gitSha: accepted.head_sha,
        images: manifest.images,
        scannedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
assert(
  !failed,
  "Recurring image vulnerability policy failed; Operations must review the workflow evidence",
);
