import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  bootstrapErrorMessage,
  createInitialStagingAdmin,
  parseBootstrapArguments,
  readBootstrapPassword,
  validateBootstrapEnvironment,
} from "../src/server/staging-admin";

let db: PrismaClient | undefined;
try {
  const connectionString = validateBootstrapEnvironment(process.env);
  const identity = parseBootstrapArguments(process.argv.slice(2));
  process.stdin.setEncoding("utf8");
  const password = await readBootstrapPassword(process.stdin);
  db = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: [],
  });
  await createInitialStagingAdmin(db, identity, password);
  console.log("Erster Staging-SUPER_ADMIN wurde erstellt.");
} catch (error) {
  console.error(bootstrapErrorMessage(error));
  process.exitCode = 1;
} finally {
  try {
    await db?.$disconnect();
  } catch {
    console.error(
      "Datenbankverbindung konnte nicht sauber geschlossen werden.",
    );
    process.exitCode = 1;
  }
}
