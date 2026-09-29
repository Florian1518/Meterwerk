import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

// Read-only preflight. Never resolve migrations or modify migration history.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const exists = await client.query(
    "SELECT to_regclass('public._prisma_migrations') AS name",
  );
  if (!exists.rows[0].name) {
    const tables = await client.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'",
    );
    if (tables.rows[0].count)
      throw new Error(
        "Unversioned nonempty database: explicit reviewed migration path required",
      );
    console.log("Migration baseline: empty database");
  } else {
    const { rows } = await client.query(
      "SELECT migration_name, checksum, finished_at FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY started_at",
    );
    for (const row of rows) {
      if (!/^[a-zA-Z0-9_]+$/.test(row.migration_name))
        throw new Error("Unknown migration name");
      if (!row.finished_at)
        throw new Error(
          `Incomplete migration: ${row.migration_name}; stop for operator review`,
        );
      const bytes = await readFile(
        `prisma/migrations/${row.migration_name}/migration.sql`,
      );
      const text = bytes.toString("utf8");
      const hashes = [
        bytes,
        text.replaceAll("\r\n", "\n"),
        text.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"),
      ].map((v) => createHash("sha256").update(v).digest("hex"));
      if (!hashes.includes(row.checksum))
        throw new Error(
          `Unsupported checksum: ${row.migration_name}. No migration was applied. Preserve database and obtain a reviewed compatibility path; do not edit _prisma_migrations or use resolve to conceal differences.`,
        );
    }
    console.log(
      `Migration baseline: ${rows.length} canonical applied migrations verified`,
    );
  }
} finally {
  await client.end();
}
