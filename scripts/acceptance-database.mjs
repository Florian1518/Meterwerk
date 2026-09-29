import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

// Destructive operations are deliberately absent. Upgrade requires a new, empty database.
const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55435");
assert.match(url.pathname, /^\/meterwerk_upgrade(?:_final|_rc)?$/);
const client = new pg.Client({ connectionString: url.href });
await client.connect();
const output = resolve(".local/acceptance");
const checks = [];
const q = (name) => `"${name.replaceAll('"', '""')}"`;
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function passed(name, details) {
  const existing = checks.findIndex((check) => check.name === name);
  if (existing !== -1) checks.splice(existing, 1);
  checks.push({ name, status: "PASSED", ...details });
  console.log(`PASS ${name}`);
}
function prisma(args) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { env: process.env, encoding: "utf8", windowsHide: true },
  );
  // Prisma output is retained without the database URL/password.
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.replaceAll(
    decodeURIComponent(url.password),
    "[REDACTED]",
  );
  console.log(text);
  assert.equal(result.status, 0, "Prisma migration execution failed");
}
async function columns(table) {
  return (
    await client.query(
      "SELECT column_name, data_type, udt_name, column_default, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
      [table],
    )
  ).rows;
}
async function insert(table, input) {
  const data = { ...input };
  for (const c of await columns(table)) {
    if (
      c.column_name in data ||
      c.is_nullable === "YES" ||
      c.column_default !== null
    )
      continue;
    let value;
    if (c.data_type === "USER-DEFINED")
      value = (
        await client.query(
          "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname=$1 ORDER BY e.enumsortorder LIMIT 1",
          [c.udt_name],
        )
      ).rows[0]?.enumlabel;
    else if (c.data_type.includes("timestamp"))
      value = new Date("2026-09-01T12:00:00Z");
    else if (
      ["integer", "numeric", "bigint", "double precision"].includes(c.data_type)
    )
      value = "1";
    else if (c.data_type === "boolean") value = false;
    else if (c.data_type === "jsonb") value = "{}";
    else if (c.data_type === "ARRAY") value = [];
    else value = `${input.id}-${c.column_name}`;
    assert.notEqual(value, undefined, `${table}.${c.column_name}`);
    data[c.column_name] = value;
  }
  const names = Object.keys(data);
  await client.query(
    `INSERT INTO ${q(table)} (${names.map(q).join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")})`,
    Object.values(data),
  );
}
try {
  if (process.argv.includes("--verify-existing")) {
    const previous = JSON.parse(
      await readFile(resolve(output, "database-results.json"), "utf8"),
    );
    checks.push(
      ...previous.checks.filter((check) => check.status === "PASSED"),
    );
  } else {
    assert.equal(
      Number(
        (
          await client.query(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
          )
        ).rows[0].count,
      ),
      0,
      "Upgrade database must be empty; never reset existing data",
    );
    const catalog = resolve(output, `upgrade-catalog-${randomUUID()}`);
    await mkdir(catalog);
    const migrationNames = (await readdir("prisma/migrations"))
      .filter((name) => /^\d/.test(name))
      .sort();
    const boundary = "202609240020_scaling_performance";
    const older = migrationNames.filter((name) => name <= boundary);
    for (const name of older)
      await cp(
        resolve("prisma/migrations", name),
        resolve(catalog, "migrations", name),
        { recursive: true },
      );
    await cp(
      "prisma/migrations/migration_lock.toml",
      resolve(catalog, "migrations/migration_lock.toml"),
    );
    const config = resolve(catalog, "prisma.config.ts");
    await writeFile(
      config,
      `import { defineConfig } from "prisma/config"; export default defineConfig({ schema: ${JSON.stringify(resolve("prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(resolve(catalog, "migrations"))} }, datasource: { url: process.env.DATABASE_URL! } });\n`,
    );
    prisma(["migrate", "deploy", "--config", config]);
    passed("older migration baseline", { migrations: older.length, boundary });
    for (const tenant of ["a", "b"]) {
      const id = (kind) => `acceptance-${tenant}-${kind}`;
      const tenantId = id("tenant");
      await insert("Tenant", {
        id: tenantId,
        slug: tenantId,
        name: "Synthetic acceptance",
      });
      await insert("User", {
        id: id("user"),
        tenantId,
        email: `${tenant}@acceptance.invalid`,
        passwordHash: "disabled-acceptance-login",
        role: "TENANT_ADMIN",
      });
      await insert("Property", { id: id("property"), tenantId });
      await insert("Building", {
        id: id("building"),
        tenantId,
        propertyId: id("property"),
      });
      await insert("Unit", {
        id: id("unit"),
        tenantId,
        buildingId: id("building"),
      });
      for (const meter of ["meter", "replacement"])
        await insert("Meter", {
          id: id(meter),
          tenantId,
          unitId: id("unit"),
          type: "ELECTRICITY",
          measurementUnit: "kWh",
        });
      await insert("Gateway", { id: id("gateway"), tenantId });
      await insert("Device", {
        id: id("device"),
        tenantId,
        meterId: id("meter"),
        gatewayId: id("gateway"),
        protocol: "MQTT",
      });
      await insert("Reading", {
        id: id("reading"),
        tenantId,
        meterId: id("meter"),
        deviceId: id("device"),
        measurementUnit: "kWh",
        source: "MANUAL",
        registerValue: "123.456789",
        consumption: "0.123456",
      });
      await insert("Rule", {
        id: id("rule"),
        tenantId,
        meterId: id("meter"),
        propertyId: id("property"),
        gatewayId: id("gateway"),
        trigger: "READING_CREATED",
      });
      await insert("WorkOrder", {
        id: id("workorder"),
        tenantId,
        propertyId: id("property"),
        meterId: id("meter"),
        type: "MAINTENANCE",
      });
      await insert("SupportCase", {
        id: id("support"),
        tenantId,
        propertyId: id("property"),
        deviceId: id("device"),
        reportedById: id("user"),
      });
      await insert("AuditEvent", {
        id: id("audit"),
        tenantId,
        actorId: id("user"),
        entityId: id("workorder"),
        action: "acceptance.fixture",
      });
      await insert("Dashboard", {
        id: id("dashboard"),
        tenantId,
        ownerId: id("user"),
        name: "Synthetic upgrade dashboard",
        description: "Preservation fixture",
      });
      await insert("DashboardWidget", {
        id: id("widget"),
        tenantId,
        dashboardId: id("dashboard"),
        title: "Synthetic widget",
        type: "KPI",
        dataSource: "READINGS",
        period: "MONTH",
        aggregation: "SUM",
      });
      await insert("Attachment", {
        id: id("attachment"),
        tenantId,
        uploadedById: id("user"),
        workOrderId: id("workorder"),
        targetType: "workOrder",
        entityId: id("workorder"),
        contentType: "text/plain",
        fileName: "synthetic.txt",
        storageKey: `acceptance/${tenant}/synthetic.txt`,
      });
      await insert("PropertyGrant", {
        tenantId,
        userId: id("user"),
        propertyId: id("property"),
      });
      await insert("PublicApiKey", { id: id("apikey"), tenantId });
      await insert("WebhookEndpoint", {
        id: id("webhook"),
        tenantId,
        url: "https://receiver.acceptance.invalid",
        events: [],
      });
    }
    const tables = [
      "Tenant",
      "User",
      "Property",
      "Building",
      "Unit",
      "Meter",
      "Reading",
      "Device",
      "Gateway",
      "Rule",
      "WorkOrder",
      "SupportCase",
      "AuditEvent",
      "Dashboard",
      "DashboardWidget",
      "Attachment",
      "PropertyGrant",
      "PublicApiKey",
      "WebhookEndpoint",
    ];
    const snapshots = [];
    for (const table of tables) {
      const names = (await columns(table)).map((c) => c.column_name);
      const sql = `SELECT ${names.map(q).join(",")} FROM ${q(table)} ORDER BY ${table === "PropertyGrant" ? '"userId"' : '"id"'}`;
      const rows = (await client.query(sql)).rows;
      snapshots.push({ table, sql, digest: hash(rows), rows: rows.length });
    }
    prisma(["migrate", "deploy"]);
    for (const s of snapshots) {
      assert.equal(
        hash((await client.query(s.sql)).rows),
        s.digest,
        `Data changed in ${s.table}`,
      );
      passed(`upgrade preserves ${s.table}`, { rows: s.rows });
    }
    const migrationCount = Number(
      (
        await client.query(
          'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
        )
      ).rows[0].count,
    );
    assert.equal(migrationCount, migrationNames.length);
    passed("all migrations applied", { migrations: migrationCount });
  }
  const fks = (
    await client.query(`SELECT c.conname, c.convalidated, cl.relname AS child, pl.relname AS parent,
    ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.o) AS childcols,
    ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.o) AS parentcols
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_class pl ON pl.oid=c.confrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace WHERE c.contype='f' AND ns.nspname='public' ORDER BY c.conname`)
  ).rows;
  for (const fk of fks) {
    assert(fk.convalidated, fk.conname);
    const present = fk.childcols
      .map((col) => `c.${q(col)} IS NOT NULL`)
      .join(" AND ");
    const join = fk.childcols
      .map((col, i) => `c.${q(col)}=p.${q(fk.parentcols[i])}`)
      .join(" AND ");
    const count = Number(
      (
        await client.query(
          `SELECT count(*) FROM ${q(fk.child)} c WHERE ${present} AND NOT EXISTS (SELECT 1 FROM ${q(fk.parent)} p WHERE ${join})`,
        )
      ).rows[0].count,
    );
    assert.equal(count, 0, fk.conname);
  }
  passed("foreign keys validated and no orphaned records", {
    constraints: fks.length,
  });
  for (const [table, column, target] of [
    ["Building", "propertyId", "property"],
    ["Unit", "buildingId", "building"],
    ["Meter", "unitId", "unit"],
    ["Reading", "meterId", "meter"],
    ["Device", "gatewayId", "gateway"],
    ["Rule", "meterId", "meter"],
    ["WorkOrder", "propertyId", "property"],
    ["Attachment", "workOrderId", "workorder"],
    ["SupportCase", "propertyId", "property"],
    ["Attachment", "uploadedById", "user"],
  ]) {
    await client.query("BEGIN");
    let rejected = false;
    try {
      await client.query(
        `UPDATE ${q(table)} SET ${q(column)}=$1 WHERE "tenantId"=$2`,
        [`acceptance-b-${target}`, "acceptance-a-tenant"],
      );
    } catch (error) {
      if (
        error.code === "23503" ||
        (error.code === "23514" &&
          ((table === "Reading" &&
            error.message === "Reading unit must match meter unit") ||
            (table === "Attachment" &&
              error.message ===
                "Attachment uploader must belong to tenant or global platform")))
      )
        rejected = true;
      else throw error;
    } finally {
      await client.query("ROLLBACK");
    }
    if (rejected) passed(`cross-tenant FK rejects ${table}.${column}`);
    else {
      checks.push({
        name: `cross-tenant ${table}.${column}`,
        status: "FAILED",
        message:
          "Database accepted foreign tenant reference; probe was rolled back",
      });
      process.exitCode = 1;
    }
  }
  await client.query("BEGIN");
  try {
    await insert("User", {
      id: "acceptance-platform",
      tenantId: null,
      email: "platform@acceptance.invalid",
      passwordHash: "disabled-acceptance-login",
      role: "SUPER_ADMIN",
    });
    await client.query(
      'UPDATE "Attachment" SET "uploadedById"=$1 WHERE "id"=$2',
      ["acceptance-platform", "acceptance-a-attachment"],
    );
    passed("global SUPER_ADMIN attachment author remains valid");
  } finally {
    await client.query("ROLLBACK");
  }
  prisma([
    "migrate",
    "diff",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
    "--exit-code",
  ]);
  passed("upgraded schema matches Prisma");
} catch (error) {
  checks.push({ name: "execution", status: "FAILED", message: error.message });
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await writeFile(
    resolve(output, "database-results.json"),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        environment: "isolated PostgreSQL acceptance",
        checks,
      },
      null,
      2,
    ),
  );
  await client.end();
}
