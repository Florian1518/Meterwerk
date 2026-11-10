import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export class NaturalWalEvidenceFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const requireEvidence = (condition, code) => {
  if (!condition) throw new NaturalWalEvidenceFailure(code);
};
const sha256 = /^[a-f0-9]{64}$/;
const walName = /^[0-9A-F]{24}$/;

function walIndex(value) {
  return BigInt(`0x${value.slice(8)}`);
}

export function verifyNaturalWalEvidence({
  settings,
  startupGate,
  t0,
  cycles,
  drillSource,
}) {
  requireEvidence(
    settings.serverVersionNum === 160015 &&
      /^16\.15(?:\s|$)/.test(settings.serverVersion),
    "STOCK_POSTGRESQL_16_15_REQUIRED",
  );
  requireEvidence(settings.walLevel === "replica", "WAL_LEVEL_INVALID");
  requireEvidence(settings.archiveMode === "on", "ARCHIVE_MODE_NOT_ACTIVE");
  requireEvidence(
    typeof settings.archiveCommand === "string" &&
      settings.archiveCommand.length > 0,
    "ARCHIVE_COMMAND_MISSING",
  );
  requireEvidence(settings.archiveLibrary === "", "ARCHIVE_LIBRARY_CONFLICT");
  requireEvidence(
    settings.archiveTimeoutSeconds === 60,
    "ARCHIVE_TIMEOUT_NOT_60_SECONDS",
  );
  requireEvidence(
    settings.archiveTimeoutSource === "configuration file" &&
      settings.archiveTimeoutPendingRestart === false,
    "ARCHIVE_TIMEOUT_RUNTIME_SOURCE_INVALID",
  );
  requireEvidence(
    settings.walSegmentSize === 16777216,
    "WAL_SEGMENT_SIZE_INVALID",
  );
  requireEvidence(
    settings.trackCommitTimestamp === "on",
    "COMMIT_TIMESTAMP_TRACKING_DISABLED",
  );
  requireEvidence(
    Number.isInteger(settings.archiverPid),
    "ARCHIVER_NOT_RUNNING",
  );
  requireEvidence(
    Number.isInteger(settings.checkpointerPid),
    "CHECKPOINTER_NOT_RUNNING",
  );
  const startupReceipt = startupGate?.receipt;
  requireEvidence(
    startupGate?.status === "PASSED" &&
      startupGate.recoveryComplete === true &&
      startupGate.switchCount === 1 &&
      startupGate.archiveConfirmed === true &&
      startupGate.runId ===
        `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || "1"}` &&
      walName.test(startupGate.segment) &&
      Number.isFinite(startupGate.gateDurationMs) &&
      startupGate.gateDurationMs >= 0 &&
      startupGate.gateDurationMs <= 600000 &&
      startupReceipt?.status === "VERIFIED" &&
      startupReceipt.wal === startupGate.segment &&
      startupReceipt.object?.key ===
        `phase3-acceptance/${startupGate.runId}/startup-wal/${startupGate.segment}.age` &&
      !!startupReceipt.object?.version &&
      Number.isInteger(startupReceipt.object?.bytes) &&
      startupReceipt.object.bytes > 0 &&
      startupReceipt.object?.sse === "AES256" &&
      sha256.test(startupReceipt.object?.sha256) &&
      sha256.test(startupReceipt.plainSha256),
    "STARTUP_WAL_GATE_EVIDENCE_INVALID",
  );
  const startup =
    drillSource
      .split("# STARTUP_WAL_GATE_BEGIN")[1]
      ?.split("# STARTUP_WAL_GATE_END")[0] ?? "";
  const steady =
    drillSource
      .split("# STEADY_STATE_RPO_BEGIN")[1]
      ?.split("# STEADY_STATE_RPO_END")[0] ?? "";
  requireEvidence(
    startup.length > 0 && steady.length > 0,
    "WAL_PROOF_PHASE_MARKERS_MISSING",
  );
  const executableStartup = startup.replace(/^\s*#.*$/gm, "");
  const executableSteady = steady.replace(/^\s*#.*$/gm, "");
  requireEvidence(
    (executableStartup.match(/\bpg_switch_wal\s*\(/gi) ?? []).length === 1 &&
      !/\bCHECKPOINT\s*;/i.test(executableStartup),
    "STARTUP_WAL_SWITCH_COUNT_INVALID",
  );
  requireEvidence(
    !/\bpg_switch_wal\s*\(|\bCHECKPOINT\s*;/i.test(executableSteady),
    "MANUAL_WAL_SWITCH_PRESENT",
  );
  requireEvidence(
    walName.test(t0.initialSegment),
    "INITIAL_WAL_SEGMENT_INVALID",
  );
  requireEvidence(
    Number.isInteger(t0.initialArchiver.archivedCount) &&
      t0.initialArchiver.archivedCount >= 1 &&
      t0.initialArchiver.failedCount === 0,
    "INITIAL_ARCHIVER_STATE_INVALID",
  );
  requireEvidence(Number.isFinite(t0.referenceAt), "T0_INVALID");
  requireEvidence(
    Array.isArray(cycles) && cycles.length === 3,
    "NATURAL_WAL_CYCLE_COUNT_INVALID",
  );

  const normalized = cycles.map((cycle, index) => {
    requireEvidence(
      cycle.cycle === index + 1,
      "NATURAL_WAL_CYCLE_ORDER_INVALID",
    );
    requireEvidence(
      cycle.manualSwitchCalls === 0 && cycle.manualCheckpointCalls === 0,
      "MANUAL_WAL_SWITCH_PRESENT",
    );
    requireEvidence(
      walName.test(cycle.wal) && cycle.wal === cycle.firstActivitySegment,
      "ACTIVITY_WAL_SEGMENT_MISMATCH",
    );
    requireEvidence(
      index === 0
        ? cycle.wal === t0.initialSegment
        : walIndex(cycle.wal) === walIndex(cycles[index - 1].wal) + 1n,
      "WAL_SEGMENT_CONTINUITY_INVALID",
    );
    requireEvidence(
      cycle.nextCurrentSegment ===
        cycle.wal.slice(0, 8) +
          (walIndex(cycle.wal) + 1n)
            .toString(16)
            .padStart(16, "0")
            .toUpperCase(),
      "NATURAL_SWITCH_NOT_OBSERVED",
    );
    requireEvidence(
      cycle.archiveTimeoutSeconds === 60,
      "ARCHIVE_TIMEOUT_NOT_60_SECONDS",
    );
    requireEvidence(
      Number.isInteger(cycle.archiverPid),
      "ARCHIVER_NOT_RUNNING",
    );
    requireEvidence(
      cycle.failedCountAfter === 0 && cycle.lastArchivedWalAfter === cycle.wal,
      "ARCHIVE_FAILURE",
    );
    requireEvidence(
      Number.isInteger(cycle.checkpointerPid) &&
        typeof cycle.checkpointerWaitEventAfter === "string" &&
        cycle.inRecoveryAfter === false &&
        Number.isInteger(cycle.walRecordsBefore) &&
        Number.isInteger(cycle.walRecordsAfter) &&
        cycle.walRecordsAfter > cycle.walRecordsBefore,
      "IMPORTANT_WAL_ACTIVITY_NOT_CONFIRMED",
    );
    requireEvidence(
      cycle.archivedCountAfter === cycle.archivedCountBefore + 1,
      "ARCHIVE_COUNT_DID_NOT_INCREASE",
    );
    requireEvidence(
      cycle.transactionCount >= 4 &&
        cycle.transactionCount <= (index === 0 ? 40 : 20),
      "LOW_VOLUME_ACTIVITY_INVALID",
    );
    requireEvidence(
      Array.isArray(cycle.transactions) &&
        cycle.transactions.length === cycle.transactionCount &&
        cycle.transactions.every(
          (transaction) =>
            Number.isFinite(transaction.committedAt) &&
            transaction.wal === cycle.wal &&
            /^\d+$/.test(transaction.xid),
        ),
      "COMMITTED_TRANSACTION_EVIDENCE_INVALID",
    );
    requireEvidence(
      cycle.currentSegmentMaxOffsetBeforeSwitch < settings.walSegmentSize &&
        cycle.lastOffsetBeforeSwitch < settings.walSegmentSize &&
        cycle.archivedWalBytes === settings.walSegmentSize,
      "WAL_SEGMENT_FILLED_BY_WORKLOAD",
    );

    const times = [
      cycle.priorNaturalSwitchObservedAt,
      cycle.activityFirstAt,
      cycle.activityLastAt,
      cycle.naturalSwitchDetectionLowerBoundAt,
      cycle.naturalSwitchObservedAt,
      cycle.archiveConfirmedAt,
      cycle.archiveConfirmationObservedAt,
      cycle.uploadedVerifiedAt,
    ];
    requireEvidence(
      times.every(Number.isFinite) &&
        cycle.priorNaturalSwitchObservedAt <= cycle.activityFirstAt &&
        cycle.activityFirstAt <= cycle.activityLastAt &&
        cycle.activityLastAt <= cycle.naturalSwitchDetectionLowerBoundAt &&
        cycle.naturalSwitchDetectionLowerBoundAt <=
          cycle.naturalSwitchObservedAt &&
        cycle.naturalSwitchDetectionLowerBoundAt <= cycle.archiveConfirmedAt &&
        cycle.archiveConfirmedAt <= cycle.uploadedVerifiedAt &&
        cycle.archiveConfirmationObservedAt >= cycle.naturalSwitchObservedAt,
      "NATURAL_WAL_TIMESTAMPS_INVALID",
    );
    requireEvidence(
      cycle.naturalSwitchDelaySeconds >= (index === 0 ? 35 : 50) &&
        cycle.naturalSwitchDelaySeconds <= (index === 0 ? 360 : 75),
      "NATURAL_WAL_SWITCH_DELAY_INVALID",
    );

    const receipt = cycle.receipt;
    requireEvidence(
      receipt?.status === "VERIFIED" && receipt.wal === cycle.wal,
      "OFFSITE_RECEIPT_INVALID",
    );
    requireEvidence(
      receipt.object?.key ===
        `phase3-acceptance/${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || "1"}/continuous-wal/${cycle.wal}.age`,
      "OFFSITE_PREFIX_INVALID",
    );
    requireEvidence(
      !!receipt.object?.version &&
        receipt.object?.sse === "AES256" &&
        Number.isInteger(receipt.object?.bytes) &&
        receipt.object.bytes > settings.walSegmentSize,
      "OFFSITE_OBJECT_METADATA_INVALID",
    );
    requireEvidence(
      sha256.test(receipt.object?.sha256) && sha256.test(receipt.plainSha256),
      "OFFSITE_HASH_INVALID",
    );

    const transactionRpoSeconds = cycle.transactions.map(
      (transaction) =>
        (cycle.uploadedVerifiedAt - transaction.committedAt) / 1000,
    );
    requireEvidence(
      transactionRpoSeconds.every((seconds) => seconds >= 0),
      "TRANSACTION_RPO_TIMESTAMP_INVALID",
    );
    const worstTransactionRpoSeconds = Math.max(...transactionRpoSeconds);

    return {
      cycle: cycle.cycle,
      wal: cycle.wal,
      archiveTimeoutSeconds: cycle.archiveTimeoutSeconds,
      manualSwitchCalls: 0,
      manualCheckpointCalls: 0,
      transactionCount: cycle.transactionCount,
      transactionRpoSamples: cycle.transactions.length,
      observedWorstTransactionToVerifiedOffsiteSeconds:
        worstTransactionRpoSeconds,
      priorNaturalSwitchObservedAt: cycle.priorNaturalSwitchObservedAt,
      activityFirstAt: cycle.activityFirstAt,
      activityLastAt: cycle.activityLastAt,
      naturalSwitchObservedAt: cycle.naturalSwitchObservedAt,
      naturalSwitchDetectionLowerBoundAt:
        cycle.naturalSwitchDetectionLowerBoundAt,
      naturalSwitchDelaySeconds: cycle.naturalSwitchDelaySeconds,
      archiveConfirmedAt: cycle.archiveConfirmedAt,
      archiveConfirmationObservedAt: cycle.archiveConfirmationObservedAt,
      switchToArchiveSeconds: cycle.switchToArchiveSeconds,
      uploadedVerifiedAt: cycle.uploadedVerifiedAt,
      archiveToUploadSeconds: cycle.archiveToUploadSeconds,
      firstActivityToOffsiteSeconds: worstTransactionRpoSeconds,
      lastActivityToOffsiteSeconds:
        (cycle.uploadedVerifiedAt - cycle.activityLastAt) / 1000,
      archivedCountBefore: cycle.archivedCountBefore,
      archivedCountAfter: cycle.archivedCountAfter,
      failedCountAfter: cycle.failedCountAfter,
      checkpointerPid: cycle.checkpointerPid,
      walRecordsBefore: cycle.walRecordsBefore,
      walRecordsAfter: cycle.walRecordsAfter,
      checkpointerWaitEventAfter: cycle.checkpointerWaitEventAfter,
      checkpointerWaitEventTypeAfter: cycle.checkpointerWaitEventTypeAfter,
      currentSegmentMaxOffsetBeforeSwitch:
        cycle.currentSegmentMaxOffsetBeforeSwitch,
      lastOffsetBeforeSwitch: cycle.lastOffsetBeforeSwitch,
      walSegmentSize: settings.walSegmentSize,
      archivedWalBytes: cycle.archivedWalBytes,
      object: receipt.object,
      ciphertextSha256: receipt.object.sha256,
      plaintextSha256: receipt.plainSha256,
      encryption: "age",
    };
  });

  const worst = Math.max(
    ...normalized.map(
      (cycle) => cycle.observedWorstTransactionToVerifiedOffsiteSeconds,
    ),
  );
  return {
    status: worst <= 300 ? "PASSED" : "FAILED",
    failureCode: worst <= 300 ? null : "TECHNICAL_RPO_TARGET_EXCEEDED",
    scope:
      "three consecutive PostgreSQL 16 archive_timeout natural-switch cycles; synthetic database and WAL only",
    event: process.env.GITHUB_EVENT_NAME,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || "1",
    sourceSha: process.env.GITHUB_SHA,
    t0,
    startupGate: {
      status: "PASSED",
      runId: startupGate.runId,
      segment: startupGate.segment,
      recoveryComplete: true,
      switchCount: 1,
      archiveConfirmedAt: startupGate.archiveConfirmedAt,
      probeCommittedAt: startupGate.probeCommittedAt,
      verifiedAt: startupReceipt.verifiedAt,
      gateDurationMs: startupGate.gateDurationMs,
      object: startupReceipt.object,
      ciphertextSha256: startupReceipt.object.sha256,
      plaintextSha256: startupReceipt.plainSha256,
      encryption: "age",
    },
    settings,
    initialArchiverState: t0.initialArchiver,
    cycles: normalized,
    observedWorstTransactionActivityToVerifiedOffsiteSeconds: worst,
    observedWorstTransactionToVerifiedOffsiteSeconds: worst,
    technicalActiveWalRpoTargetSeconds: 300,
    technicalRpoTargetMet: worst <= 300,
    startupCycleIncluded: false,
    steadyStateCyclesAfterStartupReadiness: true,
    failuresObserved: 0,
  };
}

async function main() {
  const [evidenceDirectory, outputPath] = process.argv.slice(2);
  const directory = resolve(evidenceDirectory);
  try {
    const settings = JSON.parse(
      readFileSync(join(directory, "settings.json"), "utf8"),
    );
    const startupGate = JSON.parse(
      readFileSync(join(directory, "startup-gate.json"), "utf8"),
    );
    const t0 = JSON.parse(readFileSync(join(directory, "t0.json"), "utf8"));
    const cycles = [1, 2, 3].map((number) =>
      JSON.parse(readFileSync(join(directory, `cycle-${number}.json`), "utf8")),
    );
    const drillSource = readFileSync(
      new URL("./wal-offsite-drill.sh", import.meta.url),
      "utf8",
    );
    const evidence = verifyNaturalWalEvidence({
      settings,
      startupGate,
      t0,
      cycles,
      drillSource,
    });
    writeFileSync(
      resolve(outputPath),
      JSON.stringify(evidence, null, 2) + "\n",
    );
    if (!evidence.technicalRpoTargetMet) {
      console.error(evidence.failureCode);
      process.exitCode = 1;
    }
    console.log(
      JSON.stringify({
        status: evidence.status,
        cycles: evidence.cycles.length,
        worstActivityToOffsiteSeconds:
          evidence.observedWorstTransactionActivityToVerifiedOffsiteSeconds,
      }),
    );
  } catch (error) {
    console.error(
      error instanceof NaturalWalEvidenceFailure
        ? error.code
        : "EVIDENCE_TOOLING_FAILURE",
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
