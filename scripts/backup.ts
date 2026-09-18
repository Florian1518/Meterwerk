import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export function restoreName(name: string) {
  if (!/^meterwerk_restore_[a-z0-9_]{1,32}$/.test(name))
    throw new Error("Restore requires a new meterwerk_restore_* database");
  return name;
}
function child(args: string[]) {
  const process = spawn("docker", ["compose", "exec", "-T", "db", ...args], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  process.stderr.resume(); // SQL diagnostics may contain data; never print them.
  const done = new Promise<void>((resolve, reject) => {
    process.once("error", () => reject(new Error("Docker unavailable")));
    process.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Database command failed; inspect locally with authorized tools",
            ),
          ),
    );
  });
  return { process, done };
}
export async function backupAction(
  action: string,
  file: string,
  database?: string,
) {
  const path = resolve(file);
  if (action === "backup") {
    await mkdir(dirname(path), { recursive: true });
    const { process, done } = child([
      "pg_dump",
      "-U",
      "meterwerk",
      "-d",
      "meterwerk",
      "-Fc",
      "--no-owner",
      "--no-acl",
    ]);
    process.stdin.end();
    await Promise.all([
      pipeline(
        process.stdout,
        createWriteStream(path, { flags: "wx", mode: 0o600 }),
      ),
      done,
    ]);
    const hash = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
    await writeFile(`${path}.sha256`, hash, { flag: "wx", mode: 0o600 });
    return;
  }
  if (!["verify", "restore"].includes(action))
    throw new Error("Use backup, verify or restore");
  const data = await readFile(path);
  if (
    data.subarray(0, 5).toString() !== "PGDMP" ||
    createHash("sha256").update(data).digest("hex") !==
      (await readFile(`${path}.sha256`, "utf8")).trim()
  )
    throw new Error("Backup checksum or format invalid");
  const check = child(["pg_restore", "--list"]);
  check.process.stdout.resume();
  await Promise.all([
    pipeline(createReadStream(path), check.process.stdin).catch((error) => {
      // pg_restore --list can close stdin after reading the TOC. Its exit
      // status below remains authoritative; full content is tested by restore.
      if (!["EPIPE", "EOF", "ERR_STREAM_PREMATURE_CLOSE"].includes(error.code))
        throw error;
    }),
    check.done,
  ]);
  if (action === "verify") return;
  const target = restoreName(database ?? "");
  const create = child(["createdb", "-U", "meterwerk", target]);
  create.process.stdin.end();
  create.process.stdout.resume();
  await create.done;
  const restore = child([
    "pg_restore",
    "-U",
    "meterwerk",
    "-d",
    target,
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    "--single-transaction",
  ]);
  restore.process.stdout.resume();
  await Promise.all([
    pipeline(createReadStream(path), restore.process.stdin),
    restore.done,
  ]);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await backupAction(
      process.argv[2],
      process.argv[3] ?? ".local/backups/meterwerk.dump",
      process.argv[4],
    );
    console.log("Backup operation completed");
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
