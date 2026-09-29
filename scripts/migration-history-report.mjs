import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const names = ["202609240008_dashboards", "202609240009_dashboard_recovery"];
const reports = [];
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(url.hostname, "127.0.0.1");
const client = new pg.Client({ connectionString: url.href });
await client.connect();
try {
  for (const name of names) {
    const file = `prisma/migrations/${name}/migration.sql`;
    const original = execFileSync("git", ["show", `9b8c485:${file}`]);
    const current = await readFile(file);
    const recorded = (
      await client.query(
        "SELECT checksum, finished_at IS NOT NULL AS applied FROM _prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL",
        [name],
      )
    ).rows;
    reports.push({
      name,
      originalCommit: "9b8c485",
      originalSha256: hash(original),
      workingFileSha256: hash(current),
      canonicalLfSha256: hash(current.toString().replaceAll("\r\n", "\n")),
      recorded,
    });
  }
  // Reproduce original SQL failure in an isolated, rolled-back schema using
  // real PostgreSQL; no migration-history table is altered.
  await client.query("BEGIN");
  try {
    await client.query("CREATE SCHEMA migration_original_probe");
    await client.query("SET LOCAL search_path TO migration_original_probe");
    await client.query(
      "CREATE TYPE \"Role\" AS ENUM ('SUPER_ADMIN','TENANT_ADMIN','MANAGER','USER'); CREATE TYPE \"MeterType\" AS ENUM ('ELECTRICITY','WATER','GAS','HEAT'); CREATE TABLE \"Tenant\" (id TEXT PRIMARY KEY); CREATE TABLE \"User\" (id TEXT PRIMARY KEY)",
    );
    let failure;
    try {
      await client.query(
        execFileSync(
          "git",
          [
            "show",
            "9b8c485:prisma/migrations/202609240008_dashboards/migration.sql",
          ],
          { encoding: "utf8" },
        ),
      );
    } catch (error) {
      failure = { code: error.code, message: error.message };
    }
    assert.equal(failure?.code, "42P07");
    reports.push({
      probe: "original 008 PostgreSQL execution",
      expectedFailure: failure,
      historyModified: false,
    });
  } finally {
    await client.query("ROLLBACK");
  }
  await client.query("BEGIN");
  try {
    await client.query(
      "CREATE SCHEMA migration_recovery_probe; SET LOCAL search_path TO migration_recovery_probe",
    );
    await client.query(
      "CREATE TYPE \"Role\" AS ENUM ('SUPER_ADMIN','TENANT_ADMIN','MANAGER','USER'); CREATE TYPE \"MeterType\" AS ENUM ('ELECTRICITY','WATER','GAS','HEAT'); CREATE TABLE \"Tenant\" (id TEXT PRIMARY KEY); CREATE TABLE \"User\" (id TEXT PRIMARY KEY)",
    );
    await client.query(
      await readFile(
        "prisma/migrations/202609240008_dashboards/migration.sql",
        "utf8",
      ),
    );
    let failure;
    try {
      await client.query(
        execFileSync(
          "git",
          [
            "show",
            "9b8c485:prisma/migrations/202609240009_dashboard_recovery/migration.sql",
          ],
          { encoding: "utf8" },
        ),
      );
    } catch (error) {
      failure = { code: error.code, message: error.message };
    }
    assert.equal(failure?.code, "42P07");
    reports.push({
      probe: "original 009 after canonical 008",
      expectedFailure: failure,
      historyModified: false,
    });
  } finally {
    await client.query("ROLLBACK");
  }
  console.log(JSON.stringify(reports, null, 2));
  await writeFile(
    ".local/acceptance/migration-history.json",
    JSON.stringify(reports, null, 2),
  );
} finally {
  await client.end();
}
