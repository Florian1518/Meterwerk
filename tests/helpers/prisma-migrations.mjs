import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function listPrismaMigrations(
  migrationsDirectory = resolve("prisma/migrations"),
) {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(migrationsDirectory, entry.name, "migration.sql")),
    )
    .map((entry) => entry.name)
    .sort();
}
