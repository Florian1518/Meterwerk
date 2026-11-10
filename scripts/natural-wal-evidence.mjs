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
    Number.isInteger(settings.archiverPid),
    "ARCHIVER_NOT_RUNNING",
  );
  requireEvidence(
    Number.isInteger(settings.checkpointerPid),
    "CHECKPOINTER_NOT_RUNNING",
  );
  const executableSource = drillSource.replace(/^\s*#.*$/gm, "");
  requireEvidence(
    !/\bpg_switch_wal\s*\(|\bCHECKPOINT\s*;/i.test(executableSource),
    "MANUAL_WAL_SWITCH_PRESENT",
  );
  requireEvidence(
    walName.test(t0.initialSegment),
    "INITIAL_WAL_SEGMENT_INVALID",
  );
  requireEvidence(
    t0.initialArchiver.archivedCount === 0 &&
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

    return {
      cycle: cycle.cycle,
      wal: cycle.wal,
      archiveTimeoutSeconds: cycle.archiveTimeoutSeconds,
      manualSwitchCalls: 0,
      manualCheckpointCalls: 0,
      transactionCount: cycle.transactionCount,
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
      firstActivityToOffsiteSeconds:
        (cycle.uploadedVerifiedAt - cycle.activityFirstAt) / 1000,
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
    ...normalized.map((cycle) => cycle.firstActivityToOffsiteSeconds),
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
    settings,
    initialArchiverState: t0.initialArchiver,
    cycles: normalized,
    observedWorstTransactionActivityToVerifiedOffsiteSeconds: worst,
    technicalActiveWalRpoTargetSeconds: 300,
    technicalRpoTargetMet: worst <= 300,
    startupCycleIncluded: true,
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
