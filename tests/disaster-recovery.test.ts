import { describe, expect, it } from "vitest";
import {
  assertBackupEnvironment,
  assertRestoreDatabase,
  nextBackupStatus,
  restoreChecksPassed,
  publicBackupMetadata,
  retentionKeep,
  backupRetry,
  consistencyStatus,
  assertPitrTarget,
} from "@/server/disaster-recovery";
describe("disaster recovery guards", () => {
  it("allows only isolated restore targets", () => {
    expect(assertRestoreDatabase("meterwerk_restore_test_01")).toBe(
      "meterwerk_restore_test_01",
    );
    expect(() => assertRestoreDatabase("meterwerk")).toThrow();
    expect(() => assertRestoreDatabase("meterwerk_restore_../x")).toThrow();
  });
  it("validates known environments and status transitions", () => {
    expect(assertBackupEnvironment("staging")).toBe("staging");
    expect(() => assertBackupEnvironment("unknown")).toThrow();
    expect(nextBackupStatus("RUNNING", "SUCCEEDED")).toBe("SUCCEEDED");
    expect(() => nextBackupStatus("DELETED", "RUNNING")).toThrow();
  });
  it("requires all restore checks", () => {
    expect(
      restoreChecksPassed({
        databaseReachable: true,
        tenantData: true,
        rolesConsistent: true,
        criticalForeignKeys: true,
        schemaCompatible: true,
      }),
    ).toBe(true);
    expect(restoreChecksPassed({ databaseReachable: true })).toBe(false);
  });
  it("never exposes secrets through backup metadata", () => {
    const out = publicBackupMetadata({
      id: "b",
      status: "SUCCEEDED",
      environment: "test",
      sizeBytes: 4n,
      sha256: "a".repeat(64),
      storageReference: "private/backups/b",
    });
    expect(out).not.toHaveProperty("DATABASE_URL");
    expect(out).not.toHaveProperty("token");
    expect(out.storageReference).not.toContain("password");
  });
  it("protects retention and computes bounded retry backoff", () => {
    const now = new Date("2026-01-08T00:00:00Z");
    expect(
      retentionKeep(
        new Date("2026-01-07T00:00:00Z"),
        now,
        { daily: 1, weekly: 1, monthly: 1 },
        { daily: 0, weekly: 0, monthly: 0 },
      ),
    ).toBe("KEEP");
    expect(
      retentionKeep(
        new Date("2026-01-07T00:00:00Z"),
        now,
        { daily: 1, weekly: 1, monthly: 1 },
        { daily: 1, weekly: 0, monthly: 0 },
      ),
    ).toBe("EXPIRE_CANDIDATE");
    expect(backupRetry(20).nextRetryAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 3600000 + 100,
    );
  });
  it("classifies DB/storage consistency and protects PITR", () => {
    expect(
      consistencyStatus({
        references: 2,
        objects: 2,
        checksumFailures: 0,
        unknown: 0,
      }),
    ).toBe("CONSISTENT");
    expect(
      consistencyStatus({
        references: 2,
        objects: 1,
        checksumFailures: 0,
        unknown: 0,
      }),
    ).toBe("INCONSISTENT");
    expect(
      consistencyStatus({
        references: 2,
        objects: 2,
        checksumFailures: 0,
        unknown: 1,
      }),
    ).toBe("WARNING");
    expect(assertPitrTarget("test", true, "meterwerk_restore_pitr")).toBe(true);
    expect(() =>
      assertPitrTarget("production", true, "meterwerk_restore_pitr"),
    ).toThrow();
    expect(() =>
      assertPitrTarget("test", false, "meterwerk_restore_pitr"),
    ).toThrow();
  });
});
