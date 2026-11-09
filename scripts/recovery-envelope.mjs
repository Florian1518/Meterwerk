import { readFileSync, writeFileSync } from "node:fs";

const requireValue = (ok, code) => {
  if (!ok) throw new Error(code);
};

/** Compute a conditional synthetic envelope from independently observed evidence. */
export function recoveryEnvelope(wal) {
  requireValue(wal?.status === "PASSED", "WAL_EVIDENCE_NOT_PASSED");
  requireValue(wal?.event === "workflow_dispatch", "WAL_RUN_EVENT_INVALID");
  requireValue(/^[a-f0-9]{40}$/.test(wal.sourceSha ?? ""), "WAL_SHA_INVALID");
  requireValue(
    wal.configuredArchiveTimeoutSeconds === 60,
    "WAL_TIMEOUT_UNEXPECTED",
  );
  requireValue(
    wal.manualSwitchForTimedCycle === false,
    "WAL_TIMEOUT_WAS_FORCED",
  );
  requireValue(
    Array.isArray(wal.cycles) && wal.cycles.length === 4,
    "WAL_CYCLE_EVIDENCE_INCOMPLETE",
  );
  const lags = wal.cycles.map((cycle, i) => {
    requireValue(cycle.segments === i + 1, "WAL_CONTINUITY_GAP");
    requireValue(
      Number.isFinite(cycle.lastArchiveAt) &&
        Number.isFinite(cycle.lastVerifiedUploadAt) &&
        cycle.lastVerifiedUploadAt >= cycle.lastArchiveAt,
      "WAL_TIMESTAMP_INVALID",
    );
    return (cycle.lastVerifiedUploadAt - cycle.lastArchiveAt) / 1000;
  });
  const timed = wal.timedCycle;
  requireValue(
    timed?.wal === wal.cycles[3].lastArchivedWal,
    "WAL_TIMEOUT_SEGMENT_MISMATCH",
  );
  requireValue(
    Number.isFinite(timed.writeToOffsiteSeconds) &&
      timed.writeToOffsiteSeconds > 0,
    "WAL_COMMIT_TO_OFFSITE_UNMEASURED",
  );
  requireValue(
    Number.isFinite(timed.commitToArchiveSeconds) &&
      timed.commitToArchiveSeconds >= 0 &&
      timed.commitToArchiveSeconds <= 60,
    "WAL_CADENCE_BOUND_INVALID",
  );
  requireValue(
    Number.isFinite(timed.archiveToUploadSeconds) &&
      timed.archiveToUploadSeconds >= 0,
    "WAL_UPLOAD_LAG_INVALID",
  );
  const maxObservedArchiveUploadLag = Math.max(...lags);
  const cadencePlusObservedUploadBound =
    wal.configuredArchiveTimeoutSeconds + maxObservedArchiveUploadLag;
  const rpoTargetSeconds = 300;
  const rtoTargetSeconds = 4 * 60 * 60;
  const rtos = {
    fullRestoreSeconds: 7.471,
    pitrToValidatedTargetSeconds: 8.068,
    hostLossToVerifierAndReadySeconds: 28.613,
  };
  const conservativeObservedRto = Math.max(...Object.values(rtos));
  return {
    status:
      cadencePlusObservedUploadBound <= rpoTargetSeconds &&
      conservativeObservedRto <= rtoTargetSeconds
        ? "PASSED"
        : "FAILED",
    scope:
      "synthetic technical envelope under healthy single-runner pipeline; not operational RPO/RTO or SLA",
    sources: {
      walWorkflowRun: wal.runId,
      walWorkflowSha: wal.sourceSha,
      offsiteFullRestoreRun: 41802033425,
      pitrAndRecoveryRun: 41791165665,
      hostLossRun: 42040140763,
    },
    targets: {
      technicalRpoSeconds: rpoTargetSeconds,
      technicalRtoSeconds: rtoTargetSeconds,
    },
    rpo: {
      status:
        cadencePlusObservedUploadBound <= rpoTargetSeconds
          ? "PASSED"
          : "FAILED",
      observedWorstArchiveToVerifiedOffsiteUploadSeconds: Number(
        maxObservedArchiveUploadLag.toFixed(6),
      ),
      observedNaturalTimeoutCommitToVerifiedOffsiteSeconds: Number(
        timed.writeToOffsiteSeconds.toFixed(6),
      ),
      observedNaturalTimeoutCommitToArchiveSeconds: Number(
        timed.commitToArchiveSeconds.toFixed(6),
      ),
      configuredCadenceSeconds: wal.configuredArchiveTimeoutSeconds,
      calculatedCadencePlusMaximumObservedUploadBoundSeconds: Number(
        cadencePlusObservedUploadBound.toFixed(6),
      ),
      limitation:
        "Four synthetic segments on one run; the cadence bound combines the exercised 60 s timeout with the largest observed archive-to-upload lag. No service outage, load, retention boundary, or production clock drift is represented.",
    },
    rto: {
      status: conservativeObservedRto <= rtoTargetSeconds ? "PASSED" : "FAILED",
      targetSeconds: rtoTargetSeconds,
      observations: rtos,
      conservativeObservedTechnicalEnvelopeSeconds: conservativeObservedRto,
      measurementBoundaries: {
        fullRestore:
          "external download start through restore verification and application readiness",
        pitr: "external download start through validated PITR target; application readiness is not included",
        hostLoss:
          "isolated drill start through restore verifier and application readiness",
      },
    },
    supportingMeasurements: {
      fullRestoreApplicationStartToReadySeconds: 2.257,
      fullRestoreVerificationSeconds: 1.939,
      monitoringFreshnessThresholdSeconds: 120,
      monitoringPollIntervalSeconds: null,
      observedMonitoringDetectionDelaySeconds: null,
      monitoringStatus:
        "threshold configured and stale-state fault tested; external poll cadence/detection time not measured or deployed",
      failureHandling:
        "exact deterministic tests cover ARCHIVE_FAILURE, stale conditions, WAL_GAP, upload/infrastructure errors, ciphertext/plaintext hash mismatch and ENCRYPTION_REQUIRED; no wall-clock remediation time measured",
    },
    operationalRpoRto: "PENDING",
  };
}

if (process.argv[1]?.endsWith("recovery-envelope.mjs")) {
  try {
    const [input, output] = process.argv.slice(2);
    requireValue(input && output, "INPUT_AND_OUTPUT_REQUIRED");
    const result = recoveryEnvelope(JSON.parse(readFileSync(input, "utf8")));
    writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
    console.log(
      JSON.stringify({
        status: result.status,
        rpo: result.rpo.status,
        rto: result.rto.status,
        operationalRpoRto: result.operationalRpoRto,
      }),
    );
  } catch (error) {
    console.error(
      /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "RECOVERY_ENVELOPE_FAILED",
    );
    process.exitCode = 1;
  }
}
