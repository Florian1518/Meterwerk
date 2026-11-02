import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertLocalRestoreUrl,
  restoreName,
  sha256,
  validateS3KmsKeyReference,
  validateManifest,
  verifyBackup,
} from "../scripts/backup";
import { validateRecoveryEvidence } from "../scripts/recovery-evidence";

const manifest = {
  format: 1 as const,
  database: "meterwerk_test",
  postgresVersion: "17.0",
  backupToolVersion: "pg_dump (PostgreSQL) 17.0",
  migrationVersion: "202610220001_modbus_commissioning_evidence",
  sourceSha: "a".repeat(40),
  createdAt: "2026-11-02T12:00:00.000Z",
  type: "logical-custom-encrypted" as const,
  sizeBytes: 10,
  sha256: "b".repeat(64),
  encrypted: true as const,
};

describe("backup safety", () => {
  it("only permits restoring into a new dedicated database", () => {
    expect(restoreName("meterwerk_restore_test_2026")).toBe(
      "meterwerk_restore_test_2026",
    );
    expect(() => restoreName("meterwerk")).toThrow();
    expect(() => restoreName("postgres")).toThrow();
    expect(
      assertLocalRestoreUrl(
        "postgresql://meterwerk@127.0.0.1:5432/meterwerk_restore_test_2026",
        "meterwerk_restore_test_2026",
      ).hostname,
    ).toBe("127.0.0.1");
    expect(() =>
      assertLocalRestoreUrl(
        "postgresql://meterwerk@staging.example/meterwerk_restore_test_2026",
        "meterwerk_restore_test_2026",
      ),
    ).toThrow(/local restore database/i);
  });

  it("validates encrypted backup metadata without credential fields", () => {
    expect(() => validateManifest(manifest)).not.toThrow();
    expect(() =>
      validateManifest({
        ...manifest,
        DATABASE_URL: "redacted",
      }),
    ).toThrow();
    expect(() => validateManifest({ ...manifest, sha256: "wrong" })).toThrow();
    expect(sha256(Buffer.from("meterwerk"))).toBe(
      "658701ac9d74c39c6c118313f1b2aa65473752d22ac025ac7d81dd85f8d54dc2",
    );
  });

  it("requires an explicit valid customer-controlled S3 KMS key reference", () => {
    expect(validateS3KmsKeyReference("alias/meterwerk-backups")).toBe(
      "alias/meterwerk-backups",
    );
    expect(() => validateS3KmsKeyReference("plaintext-key-material")).toThrow();
  });

  it("fails closed on missing or incomplete recovery evidence", () => {
    expect(() => validateRecoveryEvidence(undefined)).toThrow(/missing/i);
    expect(() =>
      validateRecoveryEvidence({
        status: "PASSED",
        database: "meterwerk_restore_test",
        sourceSha: "a".repeat(40),
        migrationVersion: manifest.migrationVersion,
        verifiedAt: manifest.createdAt,
        checks: { databaseReachable: true },
      }),
    ).toThrow(/incomplete/i);
  });

  it("rejects a modified encrypted backup before attempting decryption", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meterwerk-recovery-"));
    const file = join(directory, "backup.age");
    const ciphertext = Buffer.from("encrypted");
    try {
      await writeFile(file, "tamperedd");
      await writeFile(
        `${file}.manifest.json`,
        JSON.stringify({
          ...manifest,
          sizeBytes: ciphertext.length,
          sha256: sha256(ciphertext),
        }),
      );
      await expect(verifyBackup(file)).rejects.toThrow(/checksum/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
