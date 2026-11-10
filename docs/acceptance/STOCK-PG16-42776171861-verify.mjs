import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
const base = process.argv[2];
const read = (name) =>
  JSON.parse(readFileSync(join(base, name), "utf8").replace(/^\uFEFF/, ""));
const run = JSON.parse(
  readFileSync(process.argv[3], "utf8").replace(/^\uFEFF/, ""),
);
const runAttempt = run.runAttempt ?? run.run_attempt ?? "1";
const settings = read("settings.json");
assert.equal(run.event, "workflow_dispatch");
assert.equal(settings.serverVersionNum, 160015);
assert.match(settings.serverVersion, /^16\.15 /);
assert.equal(settings.archiveTimeoutSeconds, 60);
assert.match(
  readFileSync(join(base, "stock-packages.txt"), "utf8"),
  /postgresql-16\s+16\.15-/,
);
assert.match(
  readFileSync(join(base, "stock-binary.sha256"), "utf8"),
  /^[a-f0-9]{64}\s/,
);
const log = readFileSync(join(base, "postgres.log"), "utf8");
assert.equal(
  (log.match(/write-ahead log switch forced \(archive_timeout=60\)/g) || [])
    .length,
  3,
);
const cycles = [1, 2, 3].map((n) => {
  const c = read(`cycle-${n}.json`);
  const state = read(`state-cycle-${n}.json`);
  const stats = read(`cycle-${n}-stats.json`);
  const wal = `00000001000000000000000${n}`;
  assert.equal(c.wal, wal);
  assert.equal(c.firstActivitySegment, wal);
  assert.equal(c.manualSwitchCalls, 0);
  assert.equal(c.manualCheckpointCalls, 0);
  assert.equal(stats.after.requestedCheckpoints, 0);
  assert.equal(stats.after.archivedCount, n);
  assert.equal(stats.after.failedCount, 0);
  assert.equal(state.status, "PASSED");
  assert.equal(state.expectedSegments, n);
  assert(c.activityLastAt <= c.naturalSwitchDetectionLowerBoundAt);
  assert.deepEqual(c.receipt, state.receipts[wal]);
  assert.equal(c.uploadedVerifiedAt, c.receipt.verifiedAt);
  assert.equal(c.archiveConfirmedAt, stats.after.lastArchivedAt);
  assert.equal(
    c.receipt.object.key,
    `phase3-acceptance/${run.id}-${runAttempt}/continuous-wal/${wal}.age`,
  );
  assert.equal(c.receipt.object.sse, "AES256");
  assert.equal(c.receipt.object.bytes, 16781496);
  assert(c.receipt.object.bytes > settings.walSegmentSize);
  assert.equal(c.receipt.status, "VERIFIED");
  assert(c.receipt.object.version && c.receipt.object.version !== "null");
  for (const hash of [c.receipt.object.sha256, c.receipt.plainSha256])
    assert.match(hash, /^[a-f0-9]{64}$/);
  assert(c.activityFirstAt <= c.naturalSwitchDetectionLowerBoundAt);
  assert(c.naturalSwitchDetectionLowerBoundAt <= c.archiveConfirmedAt);
  assert(c.archiveConfirmedAt <= c.uploadedVerifiedAt);
  const seconds = (c.uploadedVerifiedAt - c.activityFirstAt) / 1000;
  assert.equal(seconds, c.firstActivityToOffsiteSeconds);
  return {
    cycle: n,
    wal,
    firstActivityToOffsiteSeconds: seconds,
    naturalSwitchDelaySeconds: c.naturalSwitchDelaySeconds,
    archiveToUploadSeconds: c.archiveToUploadSeconds,
    lastActivityWithinPreSwitchBound:
      c.activityLastAt <= c.naturalSwitchDetectionLowerBoundAt,
    firstActivityTimingVerified: true,
    versionPinnedReceiptVerified: true,
    sseS3AES256Verified: c.receipt.object.sse === "AES256",
    technicalRpoTargetMet: seconds <= 300,
  };
});
const worst = Math.max(...cycles.map((c) => c.firstActivityToOffsiteSeconds));
assert(worst > 300);
const result = {
  status: "FAILED",
  failureCode: "TECHNICAL_RPO_TARGET_EXCEEDED",
  workflowFailureCode: "TECHNICAL_RPO_TARGET_EXCEEDED",
  runId: run.id,
  sourceSha: run.head_sha,
  event: run.event,
  serverVersion: settings.serverVersion,
  cycles,
  worstFirstActivityToVerifiedOffsiteSeconds: worst,
  targetSeconds: 300,
  limitations: [
    "Independent artifact consistency review; no new external download performed here.",
    "The worker receipt records successful ciphertext download/hash, age decryption, and plaintext hash verification against the local WAL.",
    "First activity timestamps are sampled after commit, not exact transaction commit timestamps.",
    "This failed stock run is not final positive Technical RPO acceptance.",
  ],
  artifactHashes: readdirSync(base)
    .sort()
    .map((name) => ({
      name,
      sha256: createHash("sha256")
        .update(readFileSync(join(base, name)))
        .digest("hex"),
    })),
};
writeFileSync(process.argv[4], JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    { status: result.status, worstSeconds: worst, cycles },
    null,
    2,
  ),
);
