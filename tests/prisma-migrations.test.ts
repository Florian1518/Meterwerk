import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listPrismaMigrations } from "./helpers/prisma-migrations.mjs";

describe("Prisma migration discovery", () => {
  it("keeps the release runner tied to discovered migrations, not a magic count", () => {
    const runner = readFileSync(
      join(process.cwd(), "tests/user-management-release.mjs"),
      "utf8",
    );

    expect(runner).toContain("listPrismaMigrations()");
    expect(runner).toContain("EXPECTED_PRISMA_MIGRATIONS");
    expect(runner).not.toMatch(/\b(?:47|48) migrations?\b/i);
  });

  it("counts only migration directories containing migration.sql", () => {
    const directory = mkdtempSync(join(tmpdir(), "meterwerk-migrations-"));
    try {
      for (const name of ["202610010001_first", "202610020001_second"]) {
        const migration = join(directory, name);
        mkdirSync(migration);
        writeFileSync(join(migration, "migration.sql"), "-- synthetic");
      }
      mkdirSync(join(directory, "helper-directory"));
      writeFileSync(
        join(directory, "migration_lock.toml"),
        'provider = "postgresql"',
      );

      expect(listPrismaMigrations(directory)).toEqual([
        "202610010001_first",
        "202610020001_second",
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
