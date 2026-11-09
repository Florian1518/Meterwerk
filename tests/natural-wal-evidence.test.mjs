import assert from "node:assert/strict";
import test from "node:test";
import {
  NaturalWalEvidenceFailure,
  verifyNaturalWalEvidence,
} from "../scripts/natural-wal-evidence.mjs";

const sha = "a".repeat(64);
const segment = (index) =>
  `0000000100000000${index.toString(16).padStart(8, "0").toUpperCase()}`;

function fixture() {
  process.env.GITHUB_RUN_ID = "123456";
  process.env.GITHUB_RUN_ATTEMPT = "1";
  const settings = {
    serverVersion: "16.11",
    walLevel: "replica",
    archiveMode: "on",
    archiveCommand: "test ! -f archive/%f && cp %p archive/%f",
    archiveLibrary: "",
    archiveTimeout: "60s",
    archiveTimeoutSeconds: 60,
    archiveTimeoutSource: "configuration file",
    archiveTimeoutPendingRestart: false,
    walSegmentSize: 16777216,
    archiverPid: 33,
    checkpointerPid: 34,
  };
  const t0 = {
    referenceAt: 0,
    initialSegment: segment(1),
    initialArchiver: { archivedCount: 0, failedCount: 0 },
  };
  const cycles = [1, 2, 3].map((number) => {
    const prior = (number - 1) * 60000;
    const wal = segment(number);
    const activityFirstAt = prior + 1000;
    const activityLastAt = prior + 5000;
    const lower = prior + 59000;
    const upper = prior + 60000;
    const archiveAt = prior + 60100;
    const archiveSample = prior + 60200;
    const uploaded = prior + 70000;
    return {
      cycle: number,
      wal,
      nextCurrentSegment: segment(number + 1),
      archiveTimeoutSeconds: 60,
      manualSwitchCalls: 0,
      manualCheckpointCalls: 0,
      transactionCount: 6,
      priorNaturalSwitchObservedAt: prior,
      activityFirstAt,
      activityLastAt,
      firstActivitySegment: wal,
      naturalSwitchDetectionLowerBoundAt: lower,
      naturalSwitchObservedAt: upper,
      naturalSwitchDelaySeconds: 60,
      firstActivityToSwitchUpperBoundSeconds: (upper - activityFirstAt) / 1000,
      archiveConfirmedAt: archiveAt,
      archiveConfirmationObservedAt: archiveSample,
      switchToArchiveSeconds: (archiveAt - lower) / 1000,
      uploadedVerifiedAt: uploaded,
      archiveToUploadSeconds: (uploaded - archiveAt) / 1000,
      archivedCountBefore: number - 1,
      archivedCountAfter: number,
      failedCountAfter: 0,
      lastArchivedWalAfter: wal,
      archiverPid: 33,
      checkpointerPid: 34,
      checkpointerWaitEventAfter: "CheckpointerMain",
      checkpointerWaitEventTypeAfter: "Activity",
      inRecoveryAfter: false,
      walRecordsBefore: 100 + number * 10,
      walRecordsAfter: 105 + number * 10,
      currentSegmentMaxOffsetBeforeSwitch: 40000,
      lastOffsetBeforeSwitch: 40000,
      archivedWalBytes: 16777216,
      receipt: {
        status: "VERIFIED",
        wal,
        plainSha256: sha,
        object: {
          key: `phase3-acceptance/123456-1/continuous-wal/${wal}.age`,
          version: `version-${number}`,
          bytes: 16787456,
          sha256: sha,
          sse: "AES256",
        },
      },
    };
  });
  return {
    settings,
    t0,
    cycles,
    drillSource: "for (let cycle = 1; cycle <= 3; cycle++) insert();",
  };
}

function failsWith(input, expectedCode) {
  assert.throws(
    () => verifyNaturalWalEvidence(input),
    (error) =>
      error instanceof NaturalWalEvidenceFailure && error.code === expectedCode,
  );
}

test("accepts three consecutive low-volume natural timeout cycles with verified receipts", () => {
  const result = verifyNaturalWalEvidence(fixture());
  assert.equal(result.status, "PASSED");
  assert.equal(result.cycles.length, 3);
  assert.equal(
    result.observedWorstTransactionActivityToVerifiedOffsiteSeconds,
    69,
  );
  assert.equal(result.technicalRpoTargetMet, true);
});

test("manual WAL switch in positive proof fails with the exact condition", () => {
  const input = fixture();
  input.drillSource += "\nSELECT pg_switch_wal();\n";
  failsWith(input, "MANUAL_WAL_SWITCH_PRESENT");
});

test("archive failure never counts as a successful natural cycle", () => {
  const input = fixture();
  input.cycles[1].failedCountAfter = 1;
  failsWith(input, "ARCHIVE_FAILURE");
});

test("an offsite receipt missing its exact isolated prefix fails closed", () => {
  const input = fixture();
  input.cycles[2].receipt.object.key = "other-prefix/object.age";
  failsWith(input, "OFFSITE_PREFIX_INVALID");
});

test("two cycles cannot satisfy the three-cycle acceptance gate", () => {
  const input = fixture();
  input.cycles.pop();
  failsWith(input, "NATURAL_WAL_CYCLE_COUNT_INVALID");
});

test("a full segment offset cannot be claimed as timeout-driven", () => {
  const input = fixture();
  input.cycles[0].lastOffsetBeforeSwitch = input.settings.walSegmentSize;
  failsWith(input, "WAL_SEGMENT_FILLED_BY_WORKLOAD");
});
