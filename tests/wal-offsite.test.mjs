import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  health,
  segments,
  ship,
  tick,
  watchdog,
} from "../scripts/wal-offsite.mjs";

const first = "000000010000000000000001",
  last = "000000010000000000000002";
const plan = {
  first,
  segmentSize: 16777216,
  failedCountBefore: 0,
  maxAgeMs: 100,
};
const sample = {
  expectedLast: last,
  lastArchivedWal: last,
  failedCount: 0,
  observedAt: 1000,
  lastArchiveAt: 990,
};
const receipt = (wal) => ({
  status: "VERIFIED",
  wal,
  plainSha256: "a".repeat(64),
  object: { sha256: "b".repeat(64), version: "v1", sse: "AES256" },
  verifiedAt: 990,
});
const records = () => ({ [first]: receipt(first), [last]: receipt(last) });
const exact = (fn, message) =>
  assert.throws(fn, (error) => error.message === message);
test("independent watchdog detects dead uploader and failed pipeline", () => {
  assert.equal(
    watchdog({ status: "PASSED", checkedAt: 990 }, 1000, 100).status,
    "PASSED",
  );
  exact(
    () => watchdog({ status: "PASSED", checkedAt: 899 }, 1000, 100),
    "STALE_PIPELINE",
  );
  exact(
    () => watchdog({ status: "FAILED", checkedAt: 1000 }, 1000, 100),
    "PIPELINE_FAILURE",
  );
  exact(() => watchdog({ status: "PASSED" }, 1000, 100), "STALE_PIPELINE");
});
test("healthy bounded range reports archive and upload times", () => {
  assert.equal(health(plan, sample, records(), 1000, 100).status, "PASSED");
  assert.equal(health(plan, sample, records(), 1000, 100).expectedSegments, 2);
});
for (const [name, update, code] of [
  ["archive failure", { failedCount: 1 }, "ARCHIVE_FAILURE"],
  ["counter reset", { failedCount: -1 }, "INVALID_ARCHIVER_COUNTER"],
  ["stale observation", { observedAt: 899 }, "STALE_OBSERVATION"],
  ["future observation", { observedAt: 1001 }, "STALE_OBSERVATION"],
  ["stale archive", { lastArchiveAt: 899 }, "STALE_ARCHIVE"],
  ["missing archive time", { lastArchiveAt: null }, "STALE_ARCHIVE"],
  ["archive incomplete", { lastArchivedWal: first }, "ARCHIVE_INCOMPLETE"],
])
  test(name, () =>
    exact(
      () => health(plan, { ...sample, ...update }, records(), 1000, 100),
      code,
    ),
  );
test("missing expected receipt is exactly WAL_GAP", () =>
  exact(
    () => health(plan, sample, { [last]: receipt(last) }, 1000, 100),
    "WAL_GAP",
  ));
test("stale offsite pipeline", () => {
  const r = records();
  r[last].verifiedAt = 899;
  exact(() => health(plan, sample, r, 1000, 100), "STALE_UPLOAD");
});
test("invalid integrity receipt", () => {
  const r = records();
  r[last].object.sha256 = "";
  exact(() => health(plan, sample, r, 1000, 100), "INVALID_RECEIPT");
});
test("segment arithmetic crosses log boundary", () =>
  assert.deepEqual(
    segments("0000000100000000000000FF", "000000010000000100000000", 16777216),
    ["0000000100000000000000FF", "000000010000000100000000"],
  ));
test("timeline change fails explicitly", () =>
  exact(
    () => segments(first, "000000020000000000000002", 16777216),
    "TIMELINE_CHANGE",
  ));
test("bad size and reversed range fail explicitly", () => {
  exact(() => segments(first, last, 3), "INVALID_SEGMENT_SIZE");
  exact(() => segments(last, first, 16777216), "INVALID_WAL_RANGE");
});
test("archiver catching up is pending, then stale is an exact failure", () => {
  const deps = {
    sample: () => ({ ...sample, lastArchivedWal: first }),
    now: () => 1000,
  };
  assert.equal(tick(plan, records(), deps).status, "PENDING");
  exact(
    () => tick(plan, records(), { ...deps, now: () => 1200 }),
    "STALE_ARCHIVE",
  );
});
test("collector failure cannot pass", () =>
  exact(
    () =>
      tick(plan, records(), {
        sample() {
          throw Error("COLLECTOR_OFFLINE");
        },
      }),
    "COLLECTOR_OFFLINE",
  ));
test("remote verification failure cannot pass cached receipts", () =>
  exact(
    () =>
      tick(plan, records(), {
        sample: () => sample,
        verify() {
          throw Error("REMOTE_OFFLINE");
        },
      }),
    "REMOTE_OFFLINE",
  ));
test("successive polls upload only new segments and reverify existing ones", () => {
  const r = {};
  let uploads = 0,
    checks = 0;
  const deps = {
    sample: () => sample,
    now: () => 1000,
    ship: (wal) => {
      uploads++;
      return receipt(wal);
    },
    verify: () => {
      checks++;
    },
  };
  assert.equal(tick(plan, r, deps).status, "PASSED");
  assert.equal(tick(plan, r, deps).status, "PASSED");
  assert.equal(uploads, 2);
  assert.equal(checks, 2);
});
// Fake codec only for deterministic transport fault injection. Real age is mandatory in CI.
for (const fault of ["none", "upload", "cipher", "plain", "unencrypted"])
  test("shipping fault: " + fault, () => {
    const dir = mkdtempSync(join(tmpdir(), "wal-unit-"));
    try {
      const source = join(dir, "source");
      writeFileSync(source, "synthetic");
      const execute = () =>
        ship(
          source,
          first,
          9,
          (cipher, returned) => {
            if (fault === "upload") throw Error("UPLOAD_UNAVAILABLE");
            copyFileSync(cipher, returned);
            if (fault === "cipher") writeFileSync(returned, "damaged");
            return {
              sha256: createHash("sha256")
                .update(readFileSync(cipher))
                .digest("hex"),
              version: "test",
              sse: "AES256",
            };
          },
          (_, output) =>
            writeFileSync(
              output,
              fault === "unencrypted"
                ? "plaintext"
                : "age-encryption.org/v1\nsynthetic-test-codec",
            ),
          (_, output) =>
            writeFileSync(output, fault === "plain" ? "corrupt" : "synthetic"),
          () => 1000,
        );
      if (fault === "none") assert.equal(execute().status, "VERIFIED");
      else
        exact(
          execute,
          {
            upload: "UPLOAD_UNAVAILABLE",
            cipher: "CIPHERTEXT_HASH_MISMATCH",
            plain: "PLAINTEXT_HASH_MISMATCH",
            unencrypted: "ENCRYPTION_REQUIRED",
          }[fault],
        );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
