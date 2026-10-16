// Isolated release gate: never reads the existing DATABASE_URL or resets a database.
import { mkdtempSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";

mkdirSync(".local", { recursive: true });
const directory = mkdtempSync(resolve(".local/user-release-"));
const url = "postgresql://release_test@127.0.0.1:55451/release_test";
const baseURL = "http://localhost:3107";
const env = {
  ...process.env,
  DATABASE_URL: url,
  DOTENV_CONFIG_PATH: resolve(directory, "absent.env"),
  METERWERK_ENV: "test",
  NODE_ENV: "test",
  SEED_DEMO: "true",
  DEMO_PASSWORD: randomBytes(24).toString("hex"),
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
  port: 55451,
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
  const migrations = readdirSync("prisma/migrations", {
    withFileTypes: true,
  }).filter((e) => e.isDirectory()).length;
  if (migrations !== 47)
    throw new Error(`Expected 47 migrations, found ${migrations}`);
  await run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  await run(["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"]);
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
      "3107",
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
    "RELEASE GATE: 47 migrations, four integration suites and browser flow passed.",
  );
} finally {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await stopped;
  }
  if (started) await pg.stop();
}
