import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const databaseDir = resolve(".local/postgres");
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ||
  databaseUrl.pathname !== "/meterwerk" ||
  !databaseUrl.password
)
  throw new Error(
    "DATABASE_URL must specify the local meterwerk database and a password.",
  );
const pg = new EmbeddedPostgres({
  databaseDir,
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  port: Number(databaseUrl.port || 5432),
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (message) => console.error(String(message)),
});
if (!existsSync(resolve(databaseDir, "PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = 'meterwerk'",
);
await client.end();
if (!result.rowCount) await pg.createDatabase("meterwerk");
console.log(
  "Lokale Entwicklungsdatenbank bereit auf 127.0.0.1:5432. Mit Strg+C beenden.",
);
const keepAlive = setInterval(() => {}, 30000);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(keepAlive);
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
