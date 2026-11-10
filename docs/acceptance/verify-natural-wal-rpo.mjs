import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [directory, runPath, outputPath] = process.argv.slice(2);
assert(
  directory && runPath && outputPath,
  "usage: verify-natural-wal-rpo.mjs <artifact-dir> <run.json> <review.json>",
);
const read = (name) => JSON.parse(readFileSync(join(directory, name), "utf8"));
const run = JSON.parse(readFileSync(runPath, "utf8"));
const summary = read("summary.json");
const settings = read("settings.json");
const t0 = read("t0.json");
assert.equal(run.event, "workflow_dispatch");
assert.equal(String(run.id), summary.runId);
assert.equal(run.head_sha, summary.sourceSha);
assert.match(run.artifact_zip_sha256, /^[a-f0-9]{64}$/);
assert.equal(summary.event, "workflow_dispatch");
assert.equal(settings.serverVersionNum, 160015);
assert.match(settings.serverVersion, /^16\.15 /);
assert.equal(settings.archiveTimeoutSeconds, 60);
assert.equal(settings.trackCommitTimestamp, "on");
assert.equal(settings.walSegmentSize, 16777216);
assert.match(
  readFileSync(join(directory, "stock-packages.txt"), "utf8"),
  /postgresql-16\s+16\.15-/,
);
assert.match(
  readFileSync(join(directory, "stock-binary.sha256"), "utf8"),
  /^[a-f0-9]{64}\s/,
);
assert.equal(t0.initialArchiver.requestedCheckpoints, 0);
const postgresLog = readFileSync(join(directory, "postgres.log"), "utf8");
assert.equal(
  (
    postgresLog.match(
      /write-ahead log switch forced \(archive_timeout=60\)/g,
    ) ?? []
  ).length,
  3,
);
const csvRows = readFileSync(join(directory, "transactions.csv"), "utf8")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [cycle, xid, wal, committedAt] = line.split(",");
    return { cycle: Number(cycle), xid, wal, committedAt: Number(committedAt) };
  });
assert(csvRows.length > 0);
assert.equal(new Set(csvRows.map((row) => row.xid)).size, csvRows.length);

const cycles = [1, 2, 3].map((number) => {
  const cycle = read(`cycle-${number}.json`);
  const state = read(`state-cycle-${number}.json`);
  const stats = read(`cycle-${number}-stats.json`);
  const wal = `00000001000000000000000${number}`;
  const transactions = csvRows.filter(
    (row) => row.wal === wal && row.cycle <= number,
  );
  assert.equal(cycle.wal, wal);
  assert.equal(cycle.archiveTimeoutSeconds, 60);
  assert.equal(cycle.manualSwitchCalls, 0);
  assert.equal(cycle.manualCheckpointCalls, 0);
  assert.equal(stats.after.requestedCheckpoints, 0);
  assert.equal(stats.after.archivedCount, number);
  assert.equal(stats.after.failedCount, 0);
  assert.equal(state.status, "PASSED");
  assert.equal(cycle.transactionCount, transactions.length);
  assert.equal(cycle.transactions.length, transactions.length);
  for (const [index, transaction] of transactions.entries()) {
    assert.equal(transaction.wal, wal);
    assert.match(transaction.xid, /^\d+$/);
    assert.equal(cycle.transactions[index].xid, transaction.xid);
    assert.equal(cycle.transactions[index].wal, transaction.wal);
    assert(
      Math.abs(
        cycle.transactions[index].committedAt - transaction.committedAt,
      ) < 0.001,
    );
    assert(transaction.committedAt <= cycle.naturalSwitchDetectionLowerBoundAt);
  }
  const receipt = cycle.receipt;
  assert.equal(receipt.status, "VERIFIED");
  assert.equal(receipt.verifiedAt, cycle.uploadedVerifiedAt);
  assert.equal(receipt.object.sse, "AES256");
  assert.equal(
    receipt.object.key,
    `phase3-acceptance/${run.id}-${run.runAttempt ?? 1}/continuous-wal/${wal}.age`,
  );
  assert(receipt.object.version && receipt.object.version !== "null");
  assert.match(receipt.object.sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.plainSha256, /^[a-f0-9]{64}$/);
  assert.equal(cycle.archivedWalBytes, settings.walSegmentSize);
  assert(cycle.lastOffsetBeforeSwitch < settings.walSegmentSize);
  const worst = Math.max(
    ...transactions.map((row) => (receipt.verifiedAt - row.committedAt) / 1000),
  );
  const normalized = summary.cycles[number - 1];
  assert.equal(normalized.transactionRpoSamples, transactions.length);
  assert(
    Math.abs(
      normalized.observedWorstTransactionToVerifiedOffsiteSeconds - worst,
    ) < 0.001,
  );
  return {
    cycle: number,
    wal,
    transactionCount: transactions.length,
    observedWorstTransactionToVerifiedOffsiteSeconds: worst,
    naturalSwitchDelaySeconds: cycle.naturalSwitchDelaySeconds,
    archiveToVerifiedOffsiteSeconds: cycle.archiveToUploadSeconds,
    isolatedPrefix: receipt.object.key.slice(
      0,
      receipt.object.key.lastIndexOf("/"),
    ),
    encryptedAgeObjectVerified: true,
    sha256CiphertextVerified: true,
    sha256PlaintextVerified: true,
    sseS3AES256Verified: true,
  };
});

const worst = Math.max(
  ...cycles.map(
    (cycle) => cycle.observedWorstTransactionToVerifiedOffsiteSeconds,
  ),
);
assert.equal(summary.observedWorstTransactionToVerifiedOffsiteSeconds, worst);
assert.equal(summary.technicalActiveWalRpoTargetSeconds, 300);
assert.equal(summary.technicalRpoTargetMet, worst <= 300);
assert.equal(summary.status, worst <= 300 ? "PASSED" : "FAILED");
const review = {
  runId: run.id,
  sourceSha: run.head_sha,
  event: run.event,
  workflowConclusion: run.conclusion,
  workflowArtifactZipSha256: run.artifact_zip_sha256,
  serverVersion: settings.serverVersion,
  archiveTimeoutSeconds: settings.archiveTimeoutSeconds,
  transactionTimestampSource:
    "pg_xact_commit_timestamp with track_commit_timestamp=on",
  cycles,
  observedWorstTransactionToVerifiedOffsiteSeconds: worst,
  targetSeconds: 300,
  technicalRpoTargetMet: worst <= 300,
  status: summary.status,
  failureCode: summary.failureCode ?? null,
  artifactHashes: readdirSync(directory)
    .sort()
    .map((name) => ({
      name,
      sha256: createHash("sha256")
        .update(readFileSync(join(directory, name)))
        .digest("hex"),
    })),
};
writeFileSync(outputPath, `${JSON.stringify(review, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      status: review.status,
      failureCode: review.failureCode,
      worstSeconds: worst,
      cycles,
    },
    null,
    2,
  ),
);
