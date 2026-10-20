// Isolated release gate: never reads the existing DATABASE_URL or resets a database.
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { listPrismaMigrations } from "./helpers/prisma-migrations.mjs";

mkdirSync(".local", { recursive: true });
const directory = mkdtempSync(resolve(".local/user-release-"));
async function findFreeTcpPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    throw new Error("Could not allocate a local TCP port for the test.");
  }
  const { port } = address;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
const port = await findFreeTcpPort();
const appPort = await findFreeTcpPort();
const fixtureRunId = randomBytes(8).toString("hex");
const browserTenantId = `user-management-${fixtureRunId}-tenant`;
const browserForeignTenantId = `user-management-${fixtureRunId}-foreign`;
const browserAdminEmail = `admin-${fixtureRunId}@user-management.invalid`;
const url = `postgresql://release_test@127.0.0.1:${port}/release_test`;
const baseURL = `http://127.0.0.1:${appPort}`;
const env = {
  ...process.env,
  DATABASE_URL: url,
  EXPECTED_PRISMA_MIGRATIONS: "",
  DOTENV_CONFIG_PATH: resolve(directory, "absent.env"),
  METERWERK_ENV: "test",
  NODE_ENV: "test",
  SEED_DEMO: "true",
  DEMO_PASSWORD: randomBytes(24).toString("hex"),
  USER_MANAGEMENT_BROWSER_TENANT_ID: browserTenantId,
  USER_MANAGEMENT_BROWSER_FOREIGN_TENANT_ID: browserForeignTenantId,
  USER_MANAGEMENT_BROWSER_ADMIN_EMAIL: browserAdminEmail,
  USER_MANAGEMENT_BROWSER_PASSWORD: randomBytes(24).toString("hex"),
  SESSION_SECRET: randomBytes(32).toString("hex"),
  MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  APP_URL: baseURL,
  BROWSER_E2E_BASE_URL: baseURL,
  USER_MANAGEMENT_RELEASE_GATE: "true",
  EMAIL_PROVIDER: "local",
  NEXT_TELEMETRY_DISABLED: "1",
};
function run(args) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? accept()
        : reject(new Error(`Test command failed (${code}): ${args[0]}`)),
    );
  });
}
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: "release_test",
  password: "",
  port,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog() {},
  onError() {},
});
let started = false;
let server;
try {
  const require = createRequire(import.meta.url);
  const binaries = await (
    await import(
      pathToFileURL(
        resolve(dirname(require.resolve("embedded-postgres")), "binary.js"),
      ).href
    )
  ).default();
  await new Promise((accept, reject) => {
    const child = spawn(
      binaries.initdb,
      [
        "-D",
        directory,
        "-U",
        "release_test",
        "--auth=trust",
        "--encoding=UTF8",
        "--locale=C",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? accept() : reject(new Error("initdb failed")),
    );
  });
  await pg.start();
  started = true;
  await pg.createDatabase("release_test");
  const migrationNames = listPrismaMigrations();
  if (migrationNames.length === 0)
    throw new Error("No Prisma migration directories found in this checkout.");
  env.EXPECTED_PRISMA_MIGRATIONS = migrationNames.join(",");
  await run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  await run(["node_modules/prisma/build/index.js", "migrate", "status"]);
  await run([
    "node_modules/tsx/dist/cli.mjs",
    "--eval",
    `
      import { PrismaClient } from "./src/generated/prisma/client";
      import { PrismaPg } from "@prisma/adapter-pg";
      const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
      void (async () => {
        try {
          const rows = await prisma.$queryRawUnsafe('SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL ORDER BY "migration_name"');
        const applied = rows.map((row) => row.migration_name);
        const expected = process.env.EXPECTED_PRISMA_MIGRATIONS.split(",");
        if (JSON.stringify(applied) !== JSON.stringify(expected)) throw new Error("Applied database migrations do not exactly match this checkout.");
        console.log("Database migration history matches this checkout: " + applied.length + " migrations.");
        } finally {
          await prisma.$disconnect();
        }
      })().catch((error) => { console.error(error); process.exitCode = 1; });
    `,
  ]);
  await run(["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"]);
  await run([
    "node_modules/tsx/dist/cli.mjs",
    "tests/helpers/user-management-browser-fixtures.ts",
  ]);
  for (const file of [
    "integration",
    "import-integration",
    "data-quality-integration",
    "rules-integration",
  ])
    await run([
      "node_modules/tsx/dist/cli.mjs",
      "--conditions=react-server",
      `tests/${file}.ts`,
    ]);
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(appPort),
    ],
    {
      env: { ...env, NODE_ENV: "production" },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${baseURL}/login`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error("Isolated web server did not start");
  await run([
    "node_modules/@playwright/test/cli.js",
    "test",
    "user-management.spec.ts",
    "--project=desktop",
  ]);
  console.log(
    `RELEASE GATE: ${migrationNames.length} migrations, four integration suites and browser flow passed.`,
  );
} finally {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await stopped;
  }
  if (started) await pg.stop();
}
