import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertLocalRestoreUrl,
  restoreName,
  validateManifest,
  type BackupManifest,
} from "./backup";
import {
  validateRecoveryEvidence,
  type RecoveryEvidence,
} from "./recovery-evidence";

async function migrationStatus(connectionString: string) {
  return new Promise<boolean>((resolvePromise) => {
    const child = spawn("pnpm", ["exec", "prisma", "migrate", "status"], {
      windowsHide: true,
      stdio: "ignore",
      env: { ...process.env, DATABASE_URL: connectionString },
    });
    child.once("error", () => resolvePromise(false));
    child.once("exit", (code) => resolvePromise(code === 0));
  });
}

async function schemaDiffClean(connectionString: string) {
  return new Promise<boolean>((resolvePromise) => {
    const child = spawn(
      "pnpm",
      [
        "exec",
        "prisma",
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema=prisma/schema.prisma",
        "--exit-code",
      ],
      {
        windowsHide: true,
        stdio: "ignore",
        env: { ...process.env, DATABASE_URL: connectionString },
      },
    );
    child.once("error", () => resolvePromise(false));
    child.once("exit", (code) => resolvePromise(code === 0));
  });
}

export async function verifyRestoredDatabase(
  connectionString: string,
  database: string,
  manifestFile: string,
): Promise<RecoveryEvidence> {
  if (process.env.METERWERK_ENV !== "test")
    throw new Error("Restore verification is restricted to METERWERK_ENV=test");
  restoreName(database);
  assertLocalRestoreUrl(connectionString, database);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as unknown;
  validateManifest(manifest);
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const recovery = await client.query<{ in_recovery: boolean }>(
      "SELECT pg_is_in_recovery() AS in_recovery",
    );
    if (recovery.rows[0]?.in_recovery)
      throw new Error(
        "Restore verification failed: PostgreSQL recovery has not completed",
      );
    const tables = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    const names = new Set(tables.rows.map((row) => row.table_name));
    const expected = [
      "Tenant",
      "Meter",
      "Reading",
      "AuditEvent",
      "_prisma_migrations",
    ];
    if (expected.some((name) => !names.has(name)))
      throw new Error("Restore verification failed: core schema missing");
    const migration = await client.query<{ migration_name: string }>(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1',
    );
    if (migration.rows[0]?.migration_name !== manifest.migrationVersion)
      throw new Error(
        "Restore verification failed: migration history does not match backup manifest",
      );
    const unvalidated = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_constraint WHERE convalidated = false",
    );
    if (unvalidated.rows[0]?.count !== "0")
      throw new Error(
        "Restore verification failed: unvalidated constraints found",
      );
    const tenantCount = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "Tenant"',
    );
    const meterCount = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "Meter"',
    );
    const readingCount = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "Reading"',
    );
    const foreignKeys = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_constraint WHERE contype = 'f' AND convalidated = false",
    );
    const tenantConstraints = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_constraint WHERE contype = 'f' AND convalidated AND cardinality(conkey) > 1",
    );
    const noPendingMigrations = await migrationStatus(connectionString);
    const noSchemaDrift = await schemaDiffClean(connectionString);
    const checks = {
      databaseReachable: true,
      coreSchema: expected.every((name) => names.has(name)),
      migrationHistory:
        migration.rows[0]?.migration_name === manifest.migrationVersion,
      tenantDataReadable: Number(tenantCount.rows[0]?.count) >= 1,
      coreTablesReadable: [meterCount, readingCount].every(
        (result) => result.rows.length === 1,
      ),
      foreignKeysValidated: foreignKeys.rows[0]?.count === "0",
      tenantIntegrity: Number(tenantConstraints.rows[0]?.count) > 0,
      noSchemaDrift,
      noPendingMigrations,
    };
    if (Object.values(checks).some((passed) => !passed))
      throw new Error("Restore verification gate failed");
    const readyUrl = process.env.METERWERK_RESTORE_READY_URL;
    if (!readyUrl)
      throw new Error(
        "METERWERK_RESTORE_READY_URL is required for application compatibility verification",
      );
    const ready = await fetch(readyUrl, { signal: AbortSignal.timeout(5000) });
    if (!ready.ok)
      throw new Error(
        "Restore verification failed: application readiness is not healthy",
      );
    const evidence: RecoveryEvidence = {
      status: "PASSED",
      database,
      sourceSha: (manifest as BackupManifest).sourceSha,
      migrationVersion: migration.rows[0]!.migration_name,
      checks: { ...checks, applicationReadiness: true },
      verifiedAt: new Date().toISOString(),
    };
    validateRecoveryEvidence(evidence);
    return evidence;
  } finally {
    await client.end();
  }
}

async function main() {
  const database = process.env.PGDATABASE ?? "";
  restoreName(database);
  const connection = process.env.DATABASE_URL;
  const manifestFile = process.env.METERWERK_BACKUP_MANIFEST;
  if (!connection || !manifestFile)
    throw new Error("DATABASE_URL and METERWERK_BACKUP_MANIFEST are required");
  const evidence = await verifyRestoredDatabase(
    connection,
    database,
    resolve(manifestFile),
  );
  console.log(JSON.stringify(evidence));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main();
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
import { spawn } from "node:child_process";
