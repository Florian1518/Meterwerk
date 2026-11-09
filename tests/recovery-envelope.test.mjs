import { test } from "node:test";
import assert from "node:assert/strict";
import { recoveryEnvelope } from "../scripts/recovery-envelope.mjs";

const source = "a".repeat(40);
const wal = {
  status: "PASSED",
  event: "workflow_dispatch",
  sourceSha: source,
  configuredArchiveTimeoutSeconds: 60,
  manualSwitchForTimedCycle: false,
  cycles: [6, 10, 12, 8].map((lag, i) => ({
    segments: i + 1,
    lastArchiveAt: 100000 + i * 100000,
    lastVerifiedUploadAt: 100000 + i * 100000 + lag * 1000,
    lastArchivedWal: `segment-${i + 1}`,
  })),
  timedCycle: {
    wal: "segment-4",
    writeToOffsiteSeconds: 64,
    commitToArchiveSeconds: 56,
    archiveToUploadSeconds: 8,
  },
};
const exact = (fn, code) =>
  assert.throws(fn, (error) => error.message === code);

test("healthy synthetic envelope combines cadence and maximum verified upload lag", () => {
  const result = recoveryEnvelope(wal);
  assert.equal(result.status, "PASSED");
  assert.equal(
    result.rpo.observedWorstArchiveToVerifiedOffsiteUploadSeconds,
    12,
  );
  assert.equal(
    result.rpo.calculatedCadencePlusMaximumObservedUploadBoundSeconds,
    72,
  );
  assert.equal(
    result.rpo.observedNaturalTimeoutCommitToVerifiedOffsiteSeconds,
    64,
  );
  assert.equal(result.rto.conservativeObservedTechnicalEnvelopeSeconds, 28.613);
  assert.equal(
    result.supportingMeasurements.monitoringFreshnessThresholdSeconds,
    120,
  );
  assert.equal(
    result.supportingMeasurements.observedMonitoringDetectionDelaySeconds,
    null,
  );
  assert.equal(result.operationalRpoRto, "PENDING");
});
test("failed or manual WAL run never yields a passing envelope", () => {
  exact(
    () => recoveryEnvelope({ ...wal, status: "FAILED" }),
    "WAL_EVIDENCE_NOT_PASSED",
  );
  exact(
    () => recoveryEnvelope({ ...wal, event: "push" }),
    "WAL_RUN_EVENT_INVALID",
  );
});
test("missing natural cadence proof fails closed", () => {
  exact(
    () => recoveryEnvelope({ ...wal, manualSwitchForTimedCycle: true }),
    "WAL_TIMEOUT_WAS_FORCED",
  );
  exact(
    () =>
      recoveryEnvelope({
        ...wal,
        timedCycle: { ...wal.timedCycle, commitToArchiveSeconds: 61 },
      }),
    "WAL_CADENCE_BOUND_INVALID",
  );
});
test("missing continuity and invalid timing fail with intended codes", () => {
  exact(
    () => recoveryEnvelope({ ...wal, cycles: wal.cycles.slice(1) }),
    "WAL_CYCLE_EVIDENCE_INCOMPLETE",
  );
  exact(
    () =>
      recoveryEnvelope({
        ...wal,
        cycles: wal.cycles.map((c, i) => ({ ...c, segments: i + 2 })),
      }),
    "WAL_CONTINUITY_GAP",
  );
  exact(
    () =>
      recoveryEnvelope({
        ...wal,
        timedCycle: { ...wal.timedCycle, writeToOffsiteSeconds: 0 },
      }),
    "WAL_COMMIT_TO_OFFSITE_UNMEASURED",
  );
});
