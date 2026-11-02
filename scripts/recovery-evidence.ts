export type RecoveryEvidence = {
  status: "PASSED";
  database: string;
  sourceSha: string;
  migrationVersion: string;
  checks: Record<string, boolean>;
  verifiedAt: string;
};

const requiredChecks = [
  "databaseReachable",
  "coreSchema",
  "migrationHistory",
  "tenantDataReadable",
  "coreTablesReadable",
  "foreignKeysValidated",
  "tenantIntegrity",
  "noSchemaDrift",
  "noPendingMigrations",
  "applicationReadiness",
] as const;

export function validateRecoveryEvidence(
  value: unknown,
): asserts value is RecoveryEvidence {
  if (!value || typeof value !== "object")
    throw new Error("Recovery evidence missing");
  const evidence = value as Partial<RecoveryEvidence>;
  if (
    evidence.status !== "PASSED" ||
    !/^meterwerk_restore_[a-z0-9_]{1,32}$/.test(evidence.database ?? "") ||
    !/^[a-f0-9]{40}$/.test(evidence.sourceSha ?? "") ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(evidence.migrationVersion ?? "") ||
    !Number.isFinite(Date.parse(evidence.verifiedAt ?? "")) ||
    !evidence.checks ||
    requiredChecks.some((name) => evidence.checks?.[name] !== true)
  )
    throw new Error("Recovery evidence incomplete or failed");
}
