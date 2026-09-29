import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import pg from "pg";

const baseUrl = new URL(process.env.DATABASE_URL ?? "");
assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(baseUrl.hostname, "127.0.0.1");
assert.equal(baseUrl.port, "55435");
const tag = "v0.4b-pilot-ready";
const database = `meterwerk_pilot_upgrade_${randomBytes(5).toString("hex")}`;
const targetUrl = new URL(baseUrl);
targetUrl.pathname = `/${database}`;
const root = resolve(".local/acceptance", database);
const oldMigrations = resolve(root, "migrations");
await mkdir(oldMigrations, { recursive: true });
const report = {
  recordedAt: new Date().toISOString(),
  gitSha: spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).stdout.trim(),
  supportedBaseline: tag,
  database,
  status: "RUNNING",
  checks: [],
};
const add = (name, details = {}) => {
  report.checks.push({ name, status: "PASSED", ...details });
  console.log(`PASS ${name}`);
};
const run = (args, env = process.env) => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    {
      env,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replaceAll(
    decodeURIComponent(targetUrl.password),
    "[REDACTED]",
  );
  console.log(output);
  assert.equal(result.status, 0, `Prisma command failed: ${args.join(" ")}`);
  return output;
};
const runNode = (args, env = process.env) => {
  const result = spawnSync(process.execPath, args, {
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replaceAll(
    decodeURIComponent(targetUrl.password),
    "[REDACTED]",
  );
  console.log(output);
  assert.equal(result.status, 0, `Node command failed: ${args.join(" ")}`);
  return output;
};
let db;
let app;
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.href });
await admin.connect();
try {
  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [database],
  );
  assert.equal(exists.rowCount, 0);
  await admin.query(`CREATE DATABASE "${database}"`);
} finally {
  await admin.end();
}

try {
  const names = spawnSync(
    "git",
    ["ls-tree", "-r", "--name-only", tag, "prisma/migrations"],
    { encoding: "utf8" },
  );
  assert.equal(names.status, 0, "Supported tag must be present locally");
  const files = names.stdout
    .split(/\r?\n/)
    .filter((path) => path.endsWith("migration.sql"));
  assert.equal(files.length, 7, "v0.4b tag migration inventory changed");
  for (const file of [...files, "prisma/migrations/migration_lock.toml"]) {
    const contents = spawnSync("git", ["show", `${tag}:${file}`], {
      encoding: "buffer",
      maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(contents.status, 0, `Cannot read ${file} from ${tag}`);
    const destination = resolve(
      oldMigrations,
      file.replace("prisma/migrations/", ""),
    );
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, contents.stdout);
  }
  add("tagged migration inventory", { tag, migrations: files.length });

  const schema = resolve("prisma/schema.prisma").replaceAll("\\", "/");
  const migrations = oldMigrations.replaceAll("\\", "/");
  const config = resolve(root, "prisma.config.ts");
  await writeFile(
    config,
    `import { defineConfig } from "prisma/config"; export default defineConfig({ schema: ${JSON.stringify(schema)}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.DATABASE_URL! } });\n`,
  );
  const env = { ...process.env, DATABASE_URL: targetUrl.href };
  run(["migrate", "deploy", "--config", config], env);
  db = new pg.Client({ connectionString: targetUrl.href });
  await db.connect();
  const oldApplied = Number(
    (
      await db.query(
        'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      )
    ).rows[0].count,
  );
  assert.equal(oldApplied, files.length);
  const oldHasDashboards = await db.query(
    `SELECT to_regclass('public."Dashboard"') AS dashboard, to_regclass('public."DashboardWidget"') AS widget`,
  );
  assert.equal(oldHasDashboards.rows[0].dashboard, null);
  assert.equal(oldHasDashboards.rows[0].widget, null);
  add("v0.4b baseline applied", {
    appliedMigrations: oldApplied,
    dashboardMigrationsPresent: false,
  });

  await db.query(`
    INSERT INTO "Tenant" ("id","name","slug") VALUES ('pilot-tenant','Synthetic Pilot','synthetic-pilot');
    INSERT INTO "User" ("id","tenantId","name","email","passwordHash","role") VALUES ('pilot-user','pilot-tenant','Synthetic User','pilot@acceptance.invalid','disabled-test-hash','TENANT_ADMIN');
    INSERT INTO "Property" ("id","tenantId","name","address","city") VALUES ('pilot-property','pilot-tenant','Synthetic Property','1 Test Way','Test City');
    INSERT INTO "Building" ("id","tenantId","propertyId","name") VALUES ('pilot-building','pilot-tenant','pilot-property','Synthetic Building');
    INSERT INTO "Unit" ("id","tenantId","buildingId","name","floor","area") VALUES ('pilot-unit','pilot-tenant','pilot-building','Synthetic Unit','1',75.5);
    INSERT INTO "Meter" ("id","tenantId","unitId","serialNumber","type","manufacturer","model","measurementUnit","location","installedAt","demoPricePerUnit") VALUES ('pilot-meter','pilot-tenant','pilot-unit','PILOT-SYNTHETIC-1','ELECTRICITY','Synthetic','Acceptance','kWh','Test location',TIMESTAMP '2026-09-01 00:00:00',0.1234);
    INSERT INTO "Reading" ("id","tenantId","meterId","timestamp","registerValue","consumption","measurementUnit","source") VALUES ('pilot-reading','pilot-tenant','pilot-meter',TIMESTAMP '2026-09-02 00:00:00',123.456789,1.234567,'kWh','MANUAL');
  `);
  const before = {};
  for (const [table, columns, key] of [
    ["Tenant", ["id", "name", "slug", "createdAt"], "id"],
    [
      "User",
      [
        "id",
        "tenantId",
        "name",
        "email",
        "passwordHash",
        "role",
        "active",
        "createdAt",
      ],
      "id",
    ],
    [
      "Property",
      ["id", "tenantId", "name", "address", "city", "createdAt"],
      "id",
    ],
    ["Building", ["id", "tenantId", "propertyId", "name"], "id"],
    ["Unit", ["id", "tenantId", "buildingId", "name", "floor", "area"], "id"],
    [
      "Meter",
      [
        "id",
        "tenantId",
        "unitId",
        "serialNumber",
        "externalDeviceId",
        "type",
        "manufacturer",
        "model",
        "measurementUnit",
        "location",
        "status",
        "lastContact",
        "installedAt",
        "demoPricePerUnit",
      ],
      "id",
    ],
    [
      "Reading",
      [
        "id",
        "tenantId",
        "meterId",
        "timestamp",
        "registerValue",
        "consumption",
        "measurementUnit",
        "source",
        "quality",
      ],
      "id",
    ],
  ]) {
    const sql = `SELECT ${columns.map((column) => `"${column}"`).join(",")} FROM "${table}" ORDER BY "${key}"`;
    const rows = (await db.query(sql)).rows;
    before[table] = { sql, rows };
  }
  const oldHistory = (
    await db.query(
      'SELECT migration_name, checksum, started_at, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at',
    )
  ).rows;
  add("synthetic pre-upgrade records", {
    dataAreas: Object.keys(before),
    totalRows: Object.values(before).reduce(
      (sum, item) => sum + item.rows.length,
      0,
    ),
  });

  run(["validate", "--schema", "prisma/schema.prisma"], env);
  runNode(["scripts/verify-migration-baseline.mjs"], env);
  run(["migrate", "deploy"], env);
  const currentNames = (
    await (await import("node:fs/promises")).readdir("prisma/migrations")
  )
    .filter((name) => /^\d/.test(name))
    .sort();
  const currentApplied = Number(
    (
      await db.query(
        'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      )
    ).rows[0].count,
  );
  assert.equal(currentApplied, currentNames.length);
  assert.equal(currentApplied, 47);
  const newHistory = (
    await db.query(
      'SELECT migration_name, checksum, started_at, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at',
    )
  ).rows;
  assert.deepEqual(newHistory.slice(0, oldHistory.length), oldHistory);
  add("upgrade applied current migrations", {
    from: oldApplied,
    to: currentApplied,
    originalHistoryRowsPreserved: oldHistory.length,
    newMigrations: currentApplied - oldApplied,
  });
  for (const [table, snapshot] of Object.entries(before)) {
    const after = (await db.query(snapshot.sql)).rows;
    assert.equal(
      createHash("sha256").update(JSON.stringify(after)).digest("hex"),
      createHash("sha256").update(JSON.stringify(snapshot.rows)).digest("hex"),
      `Rows changed in ${table}`,
    );
  }
  add("upgrade retained data", { tables: Object.keys(before).length, rows: 7 });
  for (const name of [
    "202609240008_dashboards",
    "202609240009_dashboard_recovery",
  ]) {
    const row = (
      await db.query(
        'SELECT checksum FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL',
        [name],
      )
    ).rows[0];
    assert(row, `${name} not applied`);
    const bytes = await readFile(
      resolve("prisma/migrations", name, "migration.sql"),
    );
    assert.equal(
      row.checksum,
      createHash("sha256").update(bytes).digest("hex"),
    );
  }
  add("008/009 recorded from canonical v1 files", {
    previous08and09Rows: 0,
    new08and09ChecksumsMatchFiles: true,
    preexistingHistoryUntouched: true,
  });
  run(
    [
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    env,
  );
  add("upgraded schema matches Prisma");

  const { createServer } = await import("node:net");
  const probe = createServer();
  await new Promise((resolvePromise, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolvePromise);
  });
  const port = probe.address().port;
  await new Promise((resolvePromise) => probe.close(resolvePromise));
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...env,
        NODE_ENV: "production",
        APP_URL: `http://127.0.0.1:${port}`,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  for (const stream of [app.stdout, app.stderr])
    stream.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
  const checks = [];
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    try {
      const live = await fetch(`http://127.0.0.1:${port}/api/health/live`);
      const health = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
      const login = await fetch(`http://127.0.0.1:${port}/login`);
      if (
        live.status === 200 &&
        health.status === 200 &&
        login.status === 200
      ) {
        checks.push("liveness", "readiness", "login page");
        ready = true;
      }
    } catch {}
    if (!ready)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  assert(
    ready,
    `Upgraded app health smoke failed: ${serverOutput.slice(-2000)}`,
  );
  add("application start and health smoke", { checks });
  report.status = "PASSED";
} catch (error) {
  report.status = "FAILED";
  report.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  if (app && !app.killed) app.kill("SIGTERM");
  if (db) await db.end();
  report.finishedAt = new Date().toISOString();
  await writeFile(
    resolve(".local/acceptance/supported-upgrade-v0.4b.json"),
    JSON.stringify(report, null, 2),
  );
}
