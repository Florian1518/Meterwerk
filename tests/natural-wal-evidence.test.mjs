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
    serverVersion: "16.15",
    serverVersionNum: 160015,
    walLevel: "replica",
    archiveMode: "on",
    archiveCommand: "test ! -f archive/%f && cp %p archive/%f",
    archiveLibrary: "",
    archiveTimeout: "60s",
    archiveTimeoutSeconds: 60,
    archiveTimeoutSource: "configuration file",
    archiveTimeoutPendingRestart: false,
    walSegmentSize: 16777216,
    trackCommitTimestamp: "on",
    archiverPid: 33,
    checkpointerPid: 34,
  };
  const t0 = {
    referenceAt: 0,
    initialSegment: segment(2),
    initialArchiver: { archivedCount: 2, failedCount: 0 },
  };
  const cycles = [1, 2, 3].map((number) => {
    const prior = (number - 1) * 60000;
    const wal = segment(number + 1);
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
      nextCurrentSegment: segment(number + 2),
      archiveTimeoutSeconds: 60,
      manualSwitchCalls: 0,
      manualCheckpointCalls: 0,
      transactionCount: 6,
      transactions: Array.from({ length: 6 }, (_, index) => ({
        xid: String(1000 + number * 100 + index),
        wal,
        committedAt: activityFirstAt + index * 800,
      })),
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
      archivedCountBefore: number + 1,
      archivedCountAfter: number + 2,
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
    startupGate: {
      status: "PASSED",
      runId: "123456-1",
      segment: segment(0),
      recoveryComplete: true,
      switchCount: 1,
      archiveConfirmed: true,
      archiveConfirmedAt: 10,
      probeCommittedAt: 5,
      gateDurationMs: 1000,
      receipt: {
        status: "VERIFIED",
        wal: segment(0),
        plainSha256: sha,
        verifiedAt: 20,
        object: {
          key: `phase3-acceptance/123456-1/startup-wal/${segment(0)}.age`,
          version: "startup-version",
          bytes: 16787456,
          sha256: sha,
          sse: "AES256",
        },
      },
      naturalWarmup: {
        status: "PASSED",
        segment: segment(1),
        probeCommittedAt: 25,
        preSwitchOffset: 45000,
        naturalSwitch: true,
        archiveConfirmedAt: 300,
        switchLog: "DEBUG: write-ahead log switch forced (archive_timeout=60)",
        verifiedAt: 400,
        gateDurationMs: 300000,
        receipt: {
          status: "VERIFIED",
          wal: segment(1),
          plainSha256: sha,
          verifiedAt: 400,
          object: {
            key: `phase3-acceptance/123456-1/startup-wal/${segment(1)}.age`,
            version: "warmup-version",
            bytes: 16787456,
            sha256: sha,
            sse: "AES256",
          },
        },
      },
    },
    t0,
    cycles,
    drillSource:
      "# STARTUP_WAL_GATE_BEGIN\nSELECT pg_switch_wal();\n# STARTUP_WAL_GATE_END\n# STEADY_STATE_RPO_BEGIN\nfor (let cycle = 1; cycle <= 3; cycle++) insert();\n# STEADY_STATE_RPO_END",
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
  assert.equal(result.observedWorstTransactionToVerifiedOffsiteSeconds, 69);
  assert.equal(result.technicalRpoTargetMet, true);
});

test("keeps segment-boundary commits when sampled switch observation follows them", () => {
  const input = fixture();
  const thirdCycle = input.cycles[2];
  thirdCycle.activityFirstAt = thirdCycle.priorNaturalSwitchObservedAt - 25;
  thirdCycle.transactions[0].committedAt = thirdCycle.activityFirstAt;
  const result = verifyNaturalWalEvidence(input);
  assert.equal(result.status, "PASSED");
  assert.equal(result.cycles[2].transactionRpoSamples, 6);
});

test("rejects a different PostgreSQL patch release", () => {
  for (const version of ["16.11", "16.16", "16.150"]) {
    const input = fixture();
    input.settings.serverVersion = version;
    failsWith(input, "STOCK_POSTGRESQL_16_15_REQUIRED");
  }
  const input = fixture();
  input.settings.serverVersionNum = 160016;
  failsWith(input, "STOCK_POSTGRESQL_16_15_REQUIRED");
});

test("keeps steady-state acceptance independent from the startup gate", () => {
  const input = fixture();
  for (const [index, cycle] of input.cycles.entries()) {
    for (const key of [
      "naturalSwitchDetectionLowerBoundAt",
      "naturalSwitchObservedAt",
      "archiveConfirmedAt",
      "archiveConfirmationObservedAt",
      "uploadedVerifiedAt",
    ]) {
      cycle[key] += 240000;
    }
    if (index === 0) {
      cycle.naturalSwitchDelaySeconds = 300;
      cycle.transactionCount = 30;
      cycle.transactions = Array.from({ length: 30 }, (_, transaction) => ({
        xid: String(1100 + transaction),
        wal: cycle.wal,
        committedAt: cycle.activityFirstAt + transaction * 10000,
      }));
      cycle.activityLastAt += 240000;
    } else {
      for (const key of [
        "priorNaturalSwitchObservedAt",
        "activityFirstAt",
        "activityLastAt",
      ]) {
        cycle[key] += 240000;
      }
      cycle.transactions.forEach((row) => {
        row.committedAt += 240000;
      });
    }
  }
  const result = verifyNaturalWalEvidence(input);
  assert.equal(result.status, "FAILED");
  assert.equal(result.failureCode, "TECHNICAL_RPO_TARGET_EXCEEDED");
  assert.equal(
    result.observedWorstTransactionActivityToVerifiedOffsiteSeconds,
    309,
  );
  assert.equal(result.technicalRpoTargetMet, false);
  assert.equal(result.startupCycleIncluded, false);
  assert.equal(result.cycles.length, 3);
});

test("requires valid commit timestamps for every included transaction", () => {
  const input = fixture();
  input.cycles[0].transactions[2].wal = segment(9);
  failsWith(input, "COMMITTED_TRANSACTION_EVIDENCE_INVALID");

  const missing = fixture();
  missing.cycles[0].transactions.pop();
  failsWith(missing, "COMMITTED_TRANSACTION_EVIDENCE_INVALID");
});

test("uses the oldest exact commit timestamp for the five-minute RPO gate", () => {
  const input = fixture();
  input.cycles[0].transactions[0].committedAt = -240000;
  const result = verifyNaturalWalEvidence(input);
  assert.equal(result.status, "FAILED");
  assert.equal(result.failureCode, "TECHNICAL_RPO_TARGET_EXCEEDED");
  assert.equal(result.observedWorstTransactionToVerifiedOffsiteSeconds, 310);
});

test("rejects a manual WAL switch inside the steady-state proof", () => {
  const input = fixture();
  input.drillSource = input.drillSource.replace(
    "for (let cycle",
    "SELECT pg_switch_wal();\nfor (let cycle",
  );
  failsWith(input, "MANUAL_WAL_SWITCH_PRESENT");
});

test("requires exactly one switch in startup gate", () => {
  const input = fixture();
  input.drillSource = input.drillSource.replace("SELECT pg_switch_wal();", "");
  failsWith(input, "STARTUP_WAL_SWITCH_COUNT_INVALID");
});

test("requires startup recovery and verified offsite evidence before steady state", () => {
  const input = fixture();
  input.startupGate.receipt.object.sse = "";
  failsWith(input, "STARTUP_WAL_GATE_EVIDENCE_INVALID");
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
