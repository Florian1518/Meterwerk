import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

export class WalFailure extends Error {}
const requireValue = (ok, code) => {
  if (!ok) throw new WalFailure(code);
};
const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const namePattern = /^[0-9A-F]{24}$/;

// Explicit bounded single-timeline range. Timeline changes require a new plan.
export function segments(first, last, size) {
  requireValue(
    namePattern.test(first) && namePattern.test(last),
    "INVALID_WAL_NAME",
  );
  requireValue(
    Number.isInteger(size) &&
      size >= 1048576 &&
      size <= 1073741824 &&
      (size & (size - 1)) === 0,
    "INVALID_SEGMENT_SIZE",
  );
  requireValue(first.slice(0, 8) === last.slice(0, 8), "TIMELINE_CHANGE");
  const perLog = 0x100000000 / size;
  const index = (s) => {
    const low = parseInt(s.slice(16), 16);
    requireValue(low < perLog, "INVALID_WAL_NAME");
    return BigInt(parseInt(s.slice(8, 16), 16)) * BigInt(perLog) + BigInt(low);
  };
  const start = index(first),
    end = index(last);
  requireValue(end >= start && end - start < 10000n, "INVALID_WAL_RANGE");
  const result = [];
  for (let n = start; n <= end; n++)
    result.push(
      first.slice(0, 8) +
        (n / BigInt(perLog)).toString(16).padStart(8, "0").toUpperCase() +
        (n % BigInt(perLog)).toString(16).padStart(8, "0").toUpperCase(),
    );
  return result;
}

export function health(plan, sample, receipts, now, maxAge) {
  requireValue(
    Number.isFinite(now) && Number.isFinite(maxAge) && maxAge > 0,
    "INVALID_CLOCK",
  );
  const fresh = (value, code) =>
    requireValue(
      Number.isFinite(value) && value <= now && now - value <= maxAge,
      code,
    );
  requireValue(
    Number.isSafeInteger(sample.failedCount) &&
      sample.failedCount >= 0 &&
      Number.isSafeInteger(plan.failedCountBefore) &&
      plan.failedCountBefore >= 0 &&
      sample.failedCount >= plan.failedCountBefore,
    "INVALID_ARCHIVER_COUNTER",
  );
  requireValue(
    sample.failedCount === plan.failedCountBefore,
    "ARCHIVE_FAILURE",
  );
  fresh(sample.observedAt, "STALE_OBSERVATION");
  fresh(sample.lastArchiveAt, "STALE_ARCHIVE");
  const expected = segments(plan.first, sample.expectedLast, plan.segmentSize);
  requireValue(
    sample.lastArchivedWal === sample.expectedLast,
    "ARCHIVE_INCOMPLETE",
  );
  for (const name of expected) {
    const receipt = receipts[name];
    requireValue(receipt !== undefined, "WAL_GAP");
    requireValue(
      receipt.status === "VERIFIED" &&
        receipt.wal === name &&
        /^[a-f0-9]{64}$/.test(receipt.plainSha256) &&
        /^[a-f0-9]{64}$/.test(receipt.object?.sha256) &&
        !!receipt.object?.version &&
        receipt.object?.sse === "AES256",
      "INVALID_RECEIPT",
    );
  }
  fresh(receipts[sample.expectedLast].verifiedAt, "STALE_UPLOAD");
  return {
    status: "PASSED",
    scope: "synthetic-bounded-single-timeline",
    expectedSegments: expected.length,
    lastArchivedWal: sample.lastArchivedWal,
    lastArchiveAt: sample.lastArchiveAt,
    lastVerifiedUploadAt: receipts[sample.expectedLast].verifiedAt,
    checkedAt: now,
  };
}

export function watchdog(state, now, maxAge) {
  requireValue(state.status === "PASSED", "PIPELINE_FAILURE");
  requireValue(
    Number.isFinite(now) &&
      Number.isFinite(maxAge) &&
      maxAge > 0 &&
      Number.isFinite(state.checkedAt) &&
      state.checkedAt <= now &&
      now - state.checkedAt <= maxAge,
    "STALE_PIPELINE",
  );
  return { status: "PASSED", checkedAt: now };
}

function run(command, args, code = "SUBPROCESS_FAILURE") {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
  } catch {
    throw new WalFailure(code);
  }
}
function atomic(path, value) {
  writeFileSync(path + ".tmp", JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  renameSync(path + ".tmp", path);
}

export function ship(
  path,
  wal,
  size,
  transport,
  encrypt,
  decrypt,
  now = Date.now,
) {
  requireValue(namePattern.test(wal), "INVALID_WAL_NAME");
  requireValue(readFileSync(path).length === size, "INVALID_WAL_SIZE");
  const plainSha256 = hash(path);
  const directory = mkdtempSync(join(tmpdir(), "meterwerk-wal-"));
  try {
    const cipher = join(directory, wal + ".age"),
      returned = join(directory, "returned.age"),
      plain = join(directory, "verified.wal");
    encrypt(path, cipher);
    requireValue(
      readFileSync(cipher).subarray(0, 22).toString() ===
        "age-encryption.org/v1\n",
      "ENCRYPTION_REQUIRED",
    );
    const object = transport(cipher, returned, wal);
    requireValue(
      hash(cipher) === hash(returned) && object.sha256 === hash(cipher),
      "CIPHERTEXT_HASH_MISMATCH",
    );
    decrypt(returned, plain);
    requireValue(
      hash(plain) === plainSha256 && hash(path) === plainSha256,
      "PLAINTEXT_HASH_MISMATCH",
    );
    return { status: "VERIFIED", wal, plainSha256, object, verifiedAt: now() };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Each poll collects live PostgreSQL state; no success is inferred from old files.
export function tick(plan, receipts, deps) {
  const sample = deps.sample();
  requireValue(
    sample.failedCount === plan.failedCountBefore,
    "ARCHIVE_FAILURE",
  );
  if (sample.lastArchivedWal !== sample.expectedLast) {
    requireValue(
      Number.isFinite(sample.lastArchiveAt) &&
        deps.now() - sample.lastArchiveAt <= plan.maxAgeMs &&
        sample.lastArchiveAt <= deps.now(),
      "STALE_ARCHIVE",
    );
    return {
      status: "PENDING",
      code: "ARCHIVE_INCOMPLETE",
      checkedAt: deps.now(),
    };
  }
  for (const wal of segments(
    plan.first,
    sample.expectedLast,
    plan.segmentSize,
  )) {
    if (!receipts[wal]) receipts[wal] = deps.ship(wal);
    else deps.verify(receipts[wal]);
  }
  return health(plan, sample, receipts, deps.now(), plan.maxAgeMs);
}

async function main() {
  if (process.argv[2] === "check") {
    console.log(
      JSON.stringify(
        watchdog(
          JSON.parse(readFileSync(process.argv[3], "utf8")),
          Date.now(),
          Number(process.argv[4]),
        ),
      ),
    );
    return;
  }
  requireValue(process.env.METERWERK_ENV === "test", "SYNTHETIC_ONLY");
  const [planPath, statePath] = process.argv.slice(2);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const receipts = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8")).receipts
    : {};
  const bridge = resolve("scripts/wal-offsite-transport.py");
  const recipient = process.env.METERWERK_BACKUP_AGE_RECIPIENT;
  const identity = process.env.METERWERK_BACKUP_AGE_IDENTITY_FILE;
  requireValue(recipient && identity, "AGE_CONFIGURATION_REQUIRED");
  const transport = (cipher, returned, wal) =>
    JSON.parse(
      run(
        "python3",
        [bridge, "ship", cipher, returned, wal],
        "UPLOAD_OR_VERIFICATION_FAILURE",
      ),
    );
  const sample = () =>
    JSON.parse(
      run("psql", [
        "-X",
        "-A",
        "-t",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `SELECT json_build_object('observedAt',extract(epoch from clock_timestamp())*1000,'lastArchiveAt',extract(epoch from last_archived_time)*1000,'lastArchivedWal',last_archived_wal,'failedCount',failed_count,'expectedLast',pg_walfile_name(pg_current_wal_lsn() - mod(pg_current_wal_lsn() - '0/0'::pg_lsn, pg_size_bytes(current_setting('wal_segment_size'))) - 1)) FROM pg_stat_archiver`,
      ]).trim(),
    );
  const deps = {
    sample,
    now: Date.now,
    ship: (wal) =>
      ship(
        join(plan.archiveDirectory, wal),
        wal,
        plan.segmentSize,
        transport,
        (input, output) => run("age", ["-r", recipient, "-o", output, input]),
        (input, output) =>
          run("age", ["-d", "-i", identity, "-o", output, input]),
      ),
    verify: (receipt) => {
      const directory = mkdtempSync(join(tmpdir(), "meterwerk-wal-check-"));
      try {
        const record = join(directory, "record.json");
        atomic(record, receipt.object);
        run("python3", [
          bridge,
          "verify",
          record,
          join(directory, "returned.age"),
        ]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  };
  requireValue(
    Number.isInteger(plan.pollMs) && plan.pollMs >= 1000,
    "INVALID_POLL_INTERVAL",
  );
  do {
    try {
      const result = tick(plan, receipts, deps);
      atomic(statePath, { ...result, receipts });
      console.log(JSON.stringify(result));
    } catch (error) {
      atomic(statePath, {
        status: "FAILED",
        code:
          error instanceof WalFailure
            ? error.message
            : "INFRASTRUCTURE_FAILURE",
        checkedAt: Date.now(),
        receipts,
      });
      throw error;
    }
    if (process.env.WAL_OFFSITE_ONCE === "1") break;
    await new Promise((resolveWait) => setTimeout(resolveWait, plan.pollMs));
  } while (true);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(
      error instanceof WalFailure ? error.message : "INFRASTRUCTURE_FAILURE",
    );
    process.exitCode = 1;
  });
