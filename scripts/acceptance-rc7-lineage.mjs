import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { listPrismaMigrations } from "../tests/helpers/prisma-migrations.mjs";

const base = "305580eb2f214bd867030545f0180bc8dbcb224f";
const addition = "202610260001_saas_pricing";
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55435");
assert.equal(url.pathname, "/meterwerk_upgrade");
const git = (...args) => execFileSync("git", args);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
mkdirSync(".local", { recursive: true });
const root = mkdtempSync(resolve(".local/rc7-lineage-"));
const paths = git("ls-tree", "-r", "--name-only", base, "prisma/migrations")
  .toString()
  .trim()
  .split("\n");
const historical = paths.filter((p) => p.endsWith("/migration.sql"));
assert.equal(historical.length, 49);
const checksums = {};
for (const path of paths) {
  const bytes = git("show", `${base}:${path}`);
  // Git blobs are canonical LF; compare checked-out files without EOL conversion.
  assert.equal(
    readFileSync(path, "utf8").replace(/\r\n/g, "\n"),
    bytes.toString(),
  );
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  if (path.endsWith("/migration.sql"))
    checksums[path.split("/")[2]] = hash(bytes);
}
const names = Object.keys(checksums).sort();
assert(names.includes("202610190001_gateway_provisioning_foundation"));
assert(names.includes("202610220001_modbus_commissioning_evidence"));
assert.deepEqual(listPrismaMigrations(), [...names, addition].sort());
writeFileSync(
  resolve(root, "prisma/schema.prisma"),
  git("show", `${base}:prisma/schema.prisma`),
);
const config = resolve(root, "prisma.config.ts");
writeFileSync(
  config,
  `import {defineConfig} from "prisma/config"; export default defineConfig({schema:"prisma/schema.prisma",migrations:{path:"prisma/migrations"},datasource:{url:process.env.DATABASE_URL}});\n`,
);
function prisma(args) {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    {
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    },
  );
}
const db = new pg.Client({ connectionString: url.href });
await db.connect();
const history = async () =>
  (
    await db.query(
      'SELECT migration_name, checksum, started_at, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
    )
  ).rows;
const structures = async () => ({
  columns: (
    await db.query(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND (table_name LIKE 'Gateway%' OR table_name LIKE 'Modbus%' OR table_name LIKE 'Device%') ORDER BY table_name, ordinal_position`,
    )
  ).rows,
  constraints: (
    await db.query(
      `SELECT c.relname, con.conname, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (c.relname LIKE 'Gateway%' OR c.relname LIKE 'Modbus%' OR c.relname LIKE 'Device%') ORDER BY c.relname, con.conname`,
    )
  ).rows,
  indexes: (
    await db.query(
      `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND (tablename LIKE 'Gateway%' OR tablename LIKE 'Modbus%' OR tablename LIKE 'Device%') ORDER BY tablename,indexname`,
    )
  ).rows,
});
try {
  assert.equal(
    (
      await db.query(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`,
      )
    ).rows[0].n,
    0,
    "Requires a fresh isolated database; never reset an existing database",
  );
  prisma(["migrate", "deploy", "--config", config]);
  const before = await history();
  assert.deepEqual(
    before.map((r) => r.migration_name),
    names,
  );
  for (const row of before) {
    assert(row.finished_at && !row.rolled_back_at);
    assert.equal(row.checksum, checksums[row.migration_name]);
  }
  prisma([
    "migrate",
    "diff",
    "--config",
    config,
    "--from-config-datasource",
    "--to-schema",
    resolve(root, "prisma/schema.prisma"),
    "--exit-code",
  ]);
  const originalStructures = await structures();
  assert(originalStructures.columns.length > 0);
  prisma(["migrate", "deploy"]);
  const after = await history();
  assert.equal(after.length, 50);
  assert.deepEqual(after.slice(0, 49), before);
  assert.equal(after[49].migration_name, addition);
  assert.equal(
    after[49].checksum,
    hash(readFileSync(`prisma/migrations/${addition}/migration.sql`)),
  );
  assert(after[49].finished_at && !after[49].rolled_back_at);
  assert.deepEqual(await structures(), originalStructures);
  const fields = (
    await db.query(
      `SELECT table_name, column_name, data_type, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema='public' AND ((table_name='Subscription' AND column_name IN ('pricingMode','basePriceAmount','pricePerMeterAmount')) OR (table_name='Meter' AND column_name='billable')) ORDER BY table_name,column_name`,
    )
  ).rows;
  assert.equal(fields.length, 4);
  for (const field of fields.filter((r) => r.data_type === "numeric")) {
    assert.equal(field.numeric_precision, 12);
    assert.equal(field.numeric_scale, 2);
  }
  prisma(["migrate", "status"]);
  prisma([
    "migrate",
    "diff",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
    "--exit-code",
  ]);
  writeFileSync(
    resolve(root, "result.json"),
    JSON.stringify(
      {
        base,
        before: 49,
        after: 50,
        checksums,
        history: after,
        gatewayModbusStructuresUnchanged: true,
        fields,
        drift: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "RC5 -> RC7: 49 unchanged historical migrations + SaaS pricing; history, checksums, Gateway/Modbus structures and zero drift verified.",
  );
} finally {
  await db.end();
}
