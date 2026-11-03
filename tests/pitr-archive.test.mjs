import { test } from "node:test";
import assert from "node:assert/strict";
import {
  archiveState,
  requiredSegments,
  waitForArchive,
  positivePitrPassed,
} from "../scripts/pitr-archive.mjs";

const segments = ["000000010000000000000003", "000000010000000000000004"];
const plan = {
  switchExitCode: 0,
  switchLsn: "0/5000000",
  postErrorLsn: "0/4000300",
  requiredSegments: segments,
  archivedCountBefore: 2,
  failedCountBefore: 0,
};
const sample = {
  lastArchivedWal: segments[1],
  segments,
  archivedCount: 4,
  failedCount: 0,
};
test("commit without switch never confirms archive", () =>
  assert.equal(
    archiveState({ ...plan, switchLsn: null }, sample),
    "WAL_SWITCH_FAILURE",
  ));
test("switch failure never confirms archive", () =>
  assert.equal(
    archiveState({ ...plan, switchExitCode: 1 }, sample),
    "WAL_SWITCH_FAILURE",
  ));
test("switch before commit is rejected", () =>
  assert.equal(
    archiveState({ ...plan, switchLsn: "0/4000000" }, sample),
    "WAL_SWITCH_FAILURE",
  ));
test("files alone do not establish archiver completion", () =>
  assert.equal(
    archiveState(plan, { ...sample, archivedCount: 2 }, true),
    "ARCHIVE_TIMEOUT",
  ));
test("missing required segment fails", () =>
  assert.equal(
    archiveState(plan, { ...sample, segments: [segments[0]] }, true),
    "EXPECTED_WAL_NOT_ARCHIVED",
  ));
test("archiver failure overrides present files", () =>
  assert.equal(
    archiveState(plan, { ...sample, failedCount: 1 }),
    "ARCHIVER_FAILURE",
  ));
test("complete commit switch archive confirms", () =>
  assert.equal(archiveState(plan, sample), "ARCHIVE_CONFIRMED"));
test("WAL range includes an additional commit segment and handles boundaries", () => {
  assert.deepEqual(
    requiredSegments("0/3000028", "0/4000300", 1, 16777216),
    segments,
  );
  assert.deepEqual(
    requiredSegments("0/3000028", "0/5000000", 1, 16777216),
    segments,
  );
});
test("polling waits for real archive evidence", async () => {
  let time = 0,
    calls = 0;
  const result = await waitForArchive(
    plan,
    async () => (++calls === 3 ? sample : { ...sample, archivedCount: 2 }),
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
      timeoutMs: 1000,
      intervalMs: 100,
    },
  );
  assert.equal(result.result, "ARCHIVE_CONFIRMED");
  assert.equal(calls, 3);
  assert.equal(result.elapsedMs, 200);
});
test("unfinished archiving times out without success", async () => {
  let time = 0;
  const result = await waitForArchive(
    plan,
    async () => ({ ...sample, archivedCount: 2 }),
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
      timeoutMs: 300,
      intervalMs: 100,
    },
  );
  assert.equal(result.result, "ARCHIVE_TIMEOUT");
  assert.equal(result.elapsedMs, 300);
});
test("Docker/stat collection failure fails closed", async () =>
  assert.equal(
    (
      await waitForArchive(plan, async () => {
        throw new Error("Docker unavailable");
      })
    ).result,
    "ARCHIVER_FAILURE",
  ));
const positive = {
  ...plan,
  commitTimestamp: "2026-11-03T07:00:00Z",
  commitWalSegment: segments[1],
  postErrorWalSegment: segments[1],
  archiveConfirmation: { ...sample, result: "ARCHIVE_CONFIRMED" },
  baseBackupValid: true,
  recoveryResult: "TARGET_REACHED",
  inRecovery: false,
  replayLsn: "0/4000200",
  commitLsn: "0/4000100",
  recoveryTarget: { name: "meterwerk_before_error", lsn: "0/4000200" },
  baselineCount: 1,
  preErrorCount: 1,
  postTargetErrorCount: 0,
  constraintsValid: true,
  dumpReadable: true,
};
test("positive complete recovery passes", () =>
  assert.equal(positivePitrPassed(positive), true));
test("recovery before target fails even when promoted", () =>
  assert.equal(
    positivePitrPassed({ ...positive, replayLsn: "0/4000100" }),
    false,
  ));
test("missing desired commit fails", () =>
  assert.equal(positivePitrPassed({ ...positive, preErrorCount: 0 }), false));
test("post-target error present fails", () =>
  assert.equal(
    positivePitrPassed({ ...positive, postTargetErrorCount: 1 }),
    false,
  ));
test("inconsistent or unreadable database fails", () => {
  assert.equal(
    positivePitrPassed({ ...positive, constraintsValid: false }),
    false,
  );
  assert.equal(positivePitrPassed({ ...positive, dumpReadable: false }), false);
});
test("archive confirmation arriving beyond deadline is rejected", async () => {
  let time = 0;
  const result = await waitForArchive(
    plan,
    async () => {
      time = 301;
      return sample;
    },
    { now: () => time, timeoutMs: 300 },
  );
  assert.equal(result.result, "ARCHIVE_TIMEOUT");
});
