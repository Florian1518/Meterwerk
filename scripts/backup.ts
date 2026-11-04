import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";

export type BackupManifest = {
  format: 1;
  database: string;
  postgresVersion: string;
  backupToolVersion: string;
  migrationVersion: string;
  sourceSha: string;
  createdAt: string;
  type: "logical-custom-encrypted";
  sizeBytes: number;
  sha256: string;
  encrypted: true;
};

export function restoreName(name: string) {
  if (!/^meterwerk_restore_[a-z0-9_]{1,32}$/.test(name))
    throw new Error("Restore requires a new meterwerk_restore_* database");
  return name;
}

export function assertLocalRestoreUrl(
  connectionString: string,
  database: string,
) {
  restoreName(database);
  const connection = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(connection.protocol) ||
    !["localhost", "127.0.0.1", "::1"].includes(connection.hostname) ||
    decodeURIComponent(connection.pathname.slice(1)) !== database
  )
    throw new Error(
      "Restore URL must point to the isolated local restore database",
    );
  return connection;
}

export function validateManifest(
  value: unknown,
): asserts value is BackupManifest {
  if (!value || typeof value !== "object")
    throw new Error("Backup manifest invalid");
  const m = value as Partial<BackupManifest>;
  const fields = new Set([
    "format",
    "database",
    "postgresVersion",
    "backupToolVersion",
    "migrationVersion",
    "sourceSha",
    "createdAt",
    "type",
    "sizeBytes",
    "sha256",
    "encrypted",
  ]);
  if (Object.keys(m).some((key) => !fields.has(key)))
    throw new Error("Backup manifest contains unsupported fields");
  const invalid: string[] = [];
  if (m.format !== 1) invalid.push("format");
  if (!/^[a-z0-9_]{1,63}$/.test(m.database ?? "")) invalid.push("database");
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(m.postgresVersion ?? ""))
    invalid.push("postgresVersion");
  if (
    !/^pg_dump \(PostgreSQL\) \d+\.\d+(?:\.\d+)?/.test(
      m.backupToolVersion ?? "",
    )
  )
    invalid.push("backupToolVersion");
  if (!/^[\w.-]{1,128}$/.test(m.migrationVersion ?? ""))
    invalid.push("migrationVersion");
  if (!/^[a-f0-9]{40}$/.test(m.sourceSha ?? "")) invalid.push("sourceSha");
  if (!Number.isFinite(Date.parse(m.createdAt ?? "")))
    invalid.push("createdAt");
  if (m.type !== "logical-custom-encrypted") invalid.push("type");
  if (!Number.isSafeInteger(m.sizeBytes) || (m.sizeBytes ?? 0) <= 0)
    invalid.push("sizeBytes");
  if (!/^[a-f0-9]{64}$/.test(m.sha256 ?? "")) invalid.push("sha256");
  if (m.encrypted !== true) invalid.push("encrypted");
  if (invalid.length)
    throw new Error(`Backup manifest invalid: ${invalid.join(",")}`);
  const serialized = JSON.stringify(value);
  if (
    /password|secret|token|credential|postgres(?:ql)?:\/\/[^\s]*@/i.test(
      serialized,
    )
  )
    throw new Error("Backup manifest contains forbidden credential fields");
}

export function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateS3KmsKeyReference(value: string) {
  if (
    !/^(?:arn:aws(?:-[a-z]+)?:kms:[a-z0-9-]+:\d{12}:key\/[a-f0-9-]{16,}|alias\/[A-Za-z0-9/_-]{1,256})$/.test(
      value,
    )
  )
    throw new Error("S3 KMS key reference invalid");
  return value;
}

async function inspectFile(file: string) {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  let prefix = Buffer.alloc(0);
  for await (const chunk of createReadStream(file)) {
    const bytes = chunk as Buffer;
    if (prefix.length < 5)
      prefix = Buffer.concat([prefix, bytes]).subarray(0, 5);
    hash.update(bytes);
    sizeBytes += bytes.byteLength;
  }
  return { sizeBytes, sha256: hash.digest("hex"), prefix };
}

function run(
  command: string,
  args: string[],
  options: { input?: string; output?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const child = spawn(command, args, {
    windowsHide: true,
    stdio: [
      options.input ? "pipe" : "ignore",
      options.output ? "pipe" : "ignore",
      "ignore",
    ],
    env: options.env ?? process.env,
  });
  const done = new Promise<void>((resolvePromise, reject) => {
    child.once("error", () => reject(new Error(`${command} unavailable`)));
    child.once("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${command} failed`)),
    );
  });
  return { child, done };
}

function postgresEnv(databaseUrl: URL): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGHOST: databaseUrl.hostname,
    PGPORT: databaseUrl.port || "5432",
    PGDATABASE: decodeURIComponent(databaseUrl.pathname.slice(1)),
    PGUSER: decodeURIComponent(databaseUrl.username),
    PGPASSWORD: decodeURIComponent(databaseUrl.password),
    ...(databaseUrl.searchParams.get("sslmode")
      ? { PGSSLMODE: databaseUrl.searchParams.get("sslmode")! }
      : {}),
  };
}

async function readProcessOutput(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) {
  const { child, done } = run(command, args, { output: "yes", env });
  const chunks: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
  await done;
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function streamFileInto(command: string, args: string[], file: string) {
  const { child, done } = run(command, args, { input: file });
  await Promise.all([pipeline(createReadStream(file), child.stdin!), done]);
}

async function streamProcessToFile(
  command: string,
  args: string[],
  file: string,
  env?: NodeJS.ProcessEnv,
) {
  const { child, done } = run(command, args, { output: "yes", env });
  await Promise.all([
    pipeline(
      child.stdout!,
      createWriteStream(file, { flags: "wx", mode: 0o600 }),
    ),
    done,
  ]);
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function assertPrivateFile(file: string) {
  await chmod(file, 0o600);
}

async function encryptDump(dump: string, encrypted: string) {
  const recipient = requireEnv("METERWERK_BACKUP_AGE_RECIPIENT");
  // age recipients are public encryption keys; only the identity file can decrypt.
  await streamFileInto("age", ["-r", recipient, "-o", encrypted], dump);
  await assertPrivateFile(encrypted);
}

async function decryptDump(encrypted: string, output: string) {
  const identity = requireEnv("METERWERK_BACKUP_AGE_IDENTITY_FILE");
  const identityPath = resolve(identity);
  const identityInfo = await stat(identityPath);
  if (process.platform !== "win32" && (identityInfo.mode & 0o077) !== 0)
    throw new Error(
      "Age identity file permissions must be restricted to its owner",
    );
  await streamProcessToFile(
    "age",
    ["-d", "-i", identityPath, encrypted],
    output,
  );
  await assertPrivateFile(output);
}

async function uploadOffsite(
  encrypted: string,
  manifest: string,
  expectedBytes: number,
) {
  const destination = process.env.METERWERK_BACKUP_S3_URI;
  if (!destination) return;
  if (
    !/^s3:\/\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\/meterwerk-backups\/[a-zA-Z0-9/_=.-]+$/.test(
      destination,
    )
  )
    throw new Error(
      "METERWERK_BACKUP_S3_URI must be a dedicated private backup prefix",
    );
  const prefix = destination.replace(/\/$/, "");
  const sse = process.env.METERWERK_BACKUP_S3_SSE ?? "aws:kms";
  if (!["AES256", "aws:kms"].includes(sse))
    throw new Error("Unsupported S3 server-side encryption");
  const kmsKeyId =
    sse === "aws:kms"
      ? validateS3KmsKeyReference(requireEnv("METERWERK_BACKUP_S3_KMS_KEY_ID"))
      : undefined;
  const kmsKeyArn = kmsKeyId
    ? await readProcessOutput("aws", [
        "kms",
        "describe-key",
        "--key-id",
        kmsKeyId,
        "--query",
        "KeyMetadata.Arn",
        "--output",
        "text",
      ])
    : undefined;
  // AWS credentials are supplied by the standard external credential provider/role.
  // No credentials are passed on the command line or written to the manifest.
  const encryptedCopy = run("aws", [
    "s3",
    "cp",
    encrypted,
    `${prefix}/${basename(encrypted)}`,
    "--sse",
    sse,
    ...(kmsKeyId ? ["--sse-kms-key-id", kmsKeyId] : []),
    "--only-show-errors",
  ]);
  await encryptedCopy.done;
  const manifestCopy = run("aws", [
    "s3",
    "cp",
    manifest,
    `${prefix}/${basename(manifest)}`,
    "--sse",
    sse,
    ...(kmsKeyId ? ["--sse-kms-key-id", kmsKeyId] : []),
    "--only-show-errors",
  ]);
  await manifestCopy.done;
  const uri = new URL(destination);
  const key = `${uri.pathname.replace(/^\//, "").replace(/\/$/, "")}/${basename(encrypted)}`;
  const verifyRemote = async (objectKey: string, size: number) => {
    const remote = JSON.parse(
      await readProcessOutput("aws", [
        "s3api",
        "head-object",
        "--bucket",
        uri.host,
        "--key",
        objectKey,
        "--query",
        "{size:ContentLength,sse:ServerSideEncryption,version:VersionId,kmsKeyId:SSEKMSKeyId}",
        "--output",
        "json",
      ]),
    ) as { size?: number; sse?: string; version?: string; kmsKeyId?: string };
    if (
      remote.size !== size ||
      remote.sse !== sse ||
      !remote.version ||
      remote.version === "null" ||
      (kmsKeyArn !== undefined && remote.kmsKeyId !== kmsKeyArn)
    )
      throw new Error(
        "Offsite backup encryption, versioning or size verification failed",
      );
  };
  await verifyRemote(key, expectedBytes);
  await verifyRemote(
    `${uri.pathname.replace(/^\//, "").replace(/\/$/, "")}/${basename(manifest)}`,
    (await stat(manifest)).size,
  );
}

async function createBackup(file: string) {
  if (!file.toLowerCase().endsWith(".age"))
    throw new Error("Encrypted backups must use the .age extension");
  const databaseUrl = new URL(requireEnv("DATABASE_URL"));
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol))
    throw new Error("DATABASE_URL must use PostgreSQL");
  const database = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (!/^[a-z0-9_]{1,63}$/.test(database))
    throw new Error("Database name is invalid");
  const sourceSha = requireEnv("GIT_COMMIT_SHA");
  if (!/^[a-f0-9]{40}$/.test(sourceSha))
    throw new Error("GIT_COMMIT_SHA must be a full commit SHA");
  const directory = dirname(resolve(file));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(resolve(tmpdir(), "meterwerk-backup-"));
  await chmod(temporary, 0o700);
  const plain = resolve(temporary, "database.dump");
  const encrypted = `${resolve(file)}.tmp-${randomUUID()}.age`;
  const manifestPath = `${resolve(file)}.manifest.json`;
  try {
    const dbEnv = postgresEnv(databaseUrl);
    await streamProcessToFile(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl"],
      plain,
      dbEnv,
    );
    const dump = await inspectFile(plain);
    if (dump.prefix.toString() !== "PGDMP")
      throw new Error("pg_dump returned an invalid custom archive");
    await encryptDump(plain, encrypted);
    const encryptedInfo = await inspectFile(encrypted);
    const manifest: BackupManifest = {
      format: 1,
      database,
      postgresVersion: await readProcessOutput(
        "psql",
        [
          "--no-psqlrc",
          "--tuples-only",
          "--no-align",
          "--command",
          "SELECT (current_setting('server_version_num')::integer / 10000)::text || '.' || (current_setting('server_version_num')::integer % 10000)::text",
        ],
        dbEnv,
      ),
      backupToolVersion: await readProcessOutput("pg_dump", ["--version"]),
      migrationVersion: await readProcessOutput(
        "psql",
        [
          "--no-psqlrc",
          "--tuples-only",
          "--no-align",
          "--command",
          "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1",
        ],
        dbEnv,
      ),
      sourceSha,
      createdAt: new Date().toISOString(),
      type: "logical-custom-encrypted",
      sizeBytes: encryptedInfo.sizeBytes,
      sha256: encryptedInfo.sha256,
      encrypted: true,
    };
    validateManifest(manifest);
    const temporaryManifest = `${manifestPath}.tmp-${randomUUID()}`;
    await writeFile(
      temporaryManifest,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await assertPrivateFile(temporaryManifest);
    await rename(encrypted, resolve(file));
    await rename(temporaryManifest, manifestPath);
    await uploadOffsite(resolve(file), manifestPath, manifest.sizeBytes);
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(encrypted, { force: true });
  }
}

export async function verifyBackup(file: string) {
  const path = resolve(file);
  const [fileInfo, manifestBytes] = await Promise.all([
    inspectFile(path),
    readFile(`${path}.manifest.json`).catch(() => {
      throw new Error("Backup checksum or manifest invalid");
    }),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  validateManifest(manifest);
  if (
    fileInfo.sizeBytes !== manifest.sizeBytes ||
    fileInfo.sha256 !== manifest.sha256
  )
    throw new Error("Backup checksum or size invalid");
  const temporary = await mkdtemp(resolve(tmpdir(), "meterwerk-verify-"));
  await chmod(temporary, 0o700);
  const plain = resolve(temporary, "database.dump");
  try {
    await decryptDump(path, plain);
    const dump = await inspectFile(plain);
    if (dump.prefix.toString() !== "PGDMP")
      throw new Error("Decrypted archive format invalid");
    const listing = run("pg_restore", ["--list"], { input: plain });
    listing.child.stdout?.resume();
    await Promise.all([
      pipeline(createReadStream(plain), listing.child.stdin!).catch((error) => {
        if (
          !(
            ["EPIPE", "EOF", "ERR_STREAM_PREMATURE_CLOSE"] as string[]
          ).includes(error.code)
        )
          throw error;
      }),
      listing.done,
    ]);
    return manifest;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function backupAction(
  action: string,
  file: string,
  database?: string,
) {
  if (action === "backup") return createBackup(file);
  if (action === "verify") return verifyBackup(file);
  if (action === "restore") return restoreBackup(file, database ?? "");
  throw new Error("Use backup, verify or restore");
}

export async function restoreBackup(file: string, target: string) {
  restoreName(target);
  if (process.env.METERWERK_ENV !== "test")
    throw new Error("Restore is restricted to METERWERK_ENV=test");
  const manifest = await verifyBackup(file);
  const sourceUrl = new URL(requireEnv("DATABASE_URL"));
  sourceUrl.pathname = `/${target}`;
  const current = assertLocalRestoreUrl(sourceUrl.toString(), target);
  const temporary = await mkdtemp(resolve(tmpdir(), "meterwerk-restore-"));
  await chmod(temporary, 0o700);
  const plain = resolve(temporary, "database.dump");
  try {
    await decryptDump(resolve(file), plain);
    const restoreEnv = postgresEnv(current);
    const create = run("createdb", [], { env: restoreEnv });
    await create.done;
    const restore = run(
      "pg_restore",
      [
        "--dbname",
        target,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "--single-transaction",
        plain,
      ],
      { env: restoreEnv },
    );
    await restore.done;
    return {
      database: target,
      sourceSha: manifest.sourceSha,
      restoredAt: new Date().toISOString(),
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const time = new Date().toISOString().replaceAll(":", "-");
  const [action, file = `.local/backups/meterwerk-${time}.age`, database] =
    process.argv.slice(2);
  if (action === "backup") {
    await createBackup(file);
    console.log(
      "Encrypted backup created and verified for offsite upload if configured",
    );
  } else if (action === "verify") {
    const manifest = await verifyBackup(file);
    console.log(
      `Backup verified: ${manifest.sizeBytes} bytes, sha256 ${manifest.sha256}`,
    );
  } else if (action === "restore") {
    const result = await restoreBackup(file, restoreName(database ?? ""));
    console.log(`Isolated restore completed: ${result.database}`);
  } else {
    throw new Error("Use backup, verify or restore");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main();
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
