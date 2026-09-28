import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const root = resolve(".local/acceptance");
if (JSON.parse(await readFile("package.json", "utf8")).name !== "meterwerk")
  throw new Error("Run from the Meterwerk repository root");
await mkdir(root, { recursive: true });
const configPath = resolve(root, "private.json");
const mode = process.argv[2];
if (!existsSync(configPath)) {
  if (mode !== "db") throw new Error("Start isolated database first");
  await writeFile(
    configPath,
    JSON.stringify({
      password: randomBytes(24).toString("hex"),
      session: randomBytes(32).toString("hex"),
      mfa: randomBytes(32).toString("hex"),
      demo: randomBytes(24).toString("hex"),
    }),
  );
}
const config = JSON.parse(await readFile(configPath, "utf8"));
const sha =
  spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).stdout?.trim() ?? "unknown";
const env = {};
for (const key of [
  "PATH",
  "Path",
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "COMSPEC",
  "PATHEXT",
  "ProgramFiles",
  "ProgramFiles(x86)",
])
  if (process.env[key]) env[key] = process.env[key];
Object.assign(env, {
  NODE_ENV: "test",
  METERWERK_ENV: "test",
  NEXT_PUBLIC_METERWERK_ENV: "test",
  __NEXT_PROCESSED_ENV: "true",
  DOTENV_CONFIG_PATH: resolve(root, "nonexistent.env"),
  DATABASE_URL: `postgresql://acceptance:${config.password}@127.0.0.1:55435/meterwerk_acceptance`,
  APP_URL: "http://127.0.0.1:3105",
  BROWSER_E2E_BASE_URL: "http://127.0.0.1:3105",
  SESSION_SECRET: config.session,
  MFA_ENCRYPTION_KEY: config.mfa,
  WEBHOOK_SECRET_ENCRYPTION_KEY: config.mfa,
  SEED_DEMO: "true",
  DEMO_PASSWORD: config.demo,
  EMAIL_PROVIDER: "local",
  ATTACHMENT_STORAGE: "local",
  ATTACHMENT_LOCAL_ROOT: resolve(root, "attachments"),
  MQTT_BROKER_URL: "mqtt://127.0.0.1:18885",
  NEXT_TELEMETRY_DISABLED: "1",
  PLAYWRIGHT_HTML_OPEN: "never",
  POSTGRES_PASSWORD: config.password,
  GIT_COMMIT_SHA: sha,
  BUILD_TIMESTAMP: new Date().toISOString(),
});
if (mode === "db") {
  const pg = new EmbeddedPostgres({
    databaseDir: resolve(root, "postgres"),
    user: "acceptance",
    password: config.password,
    port: 55435,
    persistent: true,
    authMethod: "scram-sha-256",
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  const fresh = !existsSync(resolve(root, "postgres/PG_VERSION"));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) {
    await pg.createDatabase("meterwerk_acceptance");
    await pg.createDatabase("meterwerk_upgrade");
  }
  console.log(
    "Isolated acceptance PostgreSQL ready: 127.0.0.1:55435; new cluster=" +
      fresh,
  );
  const timer = setInterval(() => {}, 30000);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      clearInterval(timer);
      await pg.stop();
      process.exit(0);
    });
} else {
  const label = process.argv[3];
  const args = process.argv.slice(4);
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid log label");
  if (mode === "upgrade")
    env.DATABASE_URL = env.DATABASE_URL.replace(
      "/meterwerk_acceptance",
      "/meterwerk_upgrade",
    );
  if (mode === "upgradefinal")
    env.DATABASE_URL = env.DATABASE_URL.replace(
      "/meterwerk_acceptance",
      "/meterwerk_upgrade_final",
    );
  if (mode === "cleanfinal")
    env.DATABASE_URL = env.DATABASE_URL.replace(
      "/meterwerk_acceptance",
      "/meterwerk_acceptance_final",
    );
  if (mode === "web" || mode === "build") env.NODE_ENV = "production";
  if (mode === "webdev") env.NODE_ENV = "development";
  if (mode === "worker") env.RUN_WORKER = "true";
  const startedAt = new Date().toISOString();
  let output = "";
  const child = spawn(process.execPath, args, {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const redact = (value) =>
    Object.values(config).reduce(
      (s, secret) => s.replaceAll(secret, "[REDACTED]"),
      value,
    );
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      const safe = redact(chunk.toString());
      output += safe;
      process.stdout.write(safe);
    });
  child.on("error", (error) => {
    output += error.message;
  });
  child.on("close", async (code) => {
    await writeFile(resolve(root, label + ".log"), output);
    await writeFile(
      resolve(root, label + ".json"),
      JSON.stringify(
        {
          label,
          startedAt,
          finishedAt: new Date().toISOString(),
          exitCode: code,
          args,
        },
        null,
        2,
      ),
    );
    process.exitCode = code ?? 1;
  });
}
