import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyMissingWal,
  classifyIncompleteBackup,
  exitCodes,
} from "../scripts/recovery-negative-result.mjs";

const segment = "000000010000000000000003";
const wal = {
  infrastructureOk: true,
  oomKilled: false,
  containerError: "",
  expectedSegment: segment,
  running: false,
  exitCode: 1,
  recovery: "stopped",
  restoreLog: `METERWERK_WAL_REQUEST=${segment}\nMETERWERK_EXPECTED_MISSING_WAL=${segment}`,
  postgresLog: `METERWERK_EXPECTED_MISSING_WAL=${segment}\nFATAL: recovery ended before configured recovery target was reached`,
};
const base = {
  infrastructureOk: true,
  verifierExecuted: true,
  validBackupExitCode: 0,
  manifestContainsFile: true,
  removedFile: "global/pg_control",
  exitCode: 1,
  verifierLog:
    'pg_verifybackup: error: file "global/pg_control" is present in the manifest but not on disk',
};
for (const [name, patch, result] of [
  ["expected segment denied", {}, "EXPECTED_FAILURE_CONFIRMED"],
  [
    "wrong segment",
    { expectedSegment: "000000010000000000000004" },
    "UNEXPECTED_FAILURE",
  ],
  [
    "Docker startup failure",
    { infrastructureOk: false },
    "INFRASTRUCTURE_FAILURE",
  ],
  [
    "target reached",
    { recovery: "promoted", running: true },
    "UNEXPECTED_SUCCESS",
  ],
  [
    "sentinel absent",
    { restoreLog: `METERWERK_WAL_REQUEST=${segment}` },
    "UNEXPECTED_FAILURE",
  ],
  [
    "unrelated PostgreSQL exit",
    {
      postgresLog: `METERWERK_EXPECTED_MISSING_WAL=${segment}\npermission denied`,
    },
    "UNEXPECTED_FAILURE",
  ],
  ["OOM", { oomKilled: true }, "INFRASTRUCTURE_FAILURE"],
  [
    "unexpected segment also missing",
    { restoreLog: wal.restoreLog + "\nMETERWERK_UNEXPECTED_MISSING_WAL=other" },
    "UNEXPECTED_FAILURE",
  ],
  [
    "timeout with unknown recovery",
    { recovery: "unknown", running: true },
    "UNEXPECTED_FAILURE",
  ],
  [
    "confirmed recovery still waiting",
    { recovery: "in_recovery", running: true, exitCode: 0 },
    "EXPECTED_FAILURE_CONFIRMED",
  ],
])
  test(`missing WAL: ${name}`, () =>
    assert.equal(classifyMissingWal({ ...wal, ...patch }), result));
for (const [name, patch, result] of [
  ["controlled manifest file removal", {}, "EXPECTED_FAILURE_CONFIRMED"],
  ["valid backup", { exitCode: 0 }, "UNEXPECTED_SUCCESS"],
  ["Docker startup failure", { exitCode: 125 }, "INFRASTRUCTURE_FAILURE"],
  [
    "wrong error cause",
    { verifierLog: "pg_verifybackup: error: permission denied" },
    "UNEXPECTED_FAILURE",
  ],
  [
    "verifier unavailable",
    { exitCode: 127, verifierExecuted: false },
    "INFRASTRUCTURE_FAILURE",
  ],
  [
    "verifier not executed",
    { verifierExecuted: false },
    "INFRASTRUCTURE_FAILURE",
  ],
  ["invalid original", { validBackupExitCode: 1 }, "UNEXPECTED_FAILURE"],
  [
    "file absent from manifest",
    { manifestContainsFile: false },
    "UNEXPECTED_FAILURE",
  ],
  [
    "additional error",
    {
      verifierLog:
        base.verifierLog + "\npg_verifybackup: error: another failure",
    },
    "UNEXPECTED_FAILURE",
  ],
])
  test(`incomplete base: ${name}`, () =>
    assert.equal(classifyIncompleteBackup({ ...base, ...patch }), result));
test("only confirmed expected failure exits successfully", () => {
  assert.equal(exitCodes.EXPECTED_FAILURE_CONFIRMED, 0);
  for (const state of [
    "UNEXPECTED_FAILURE",
    "UNEXPECTED_SUCCESS",
    "INFRASTRUCTURE_FAILURE",
  ])
    assert.notEqual(exitCodes[state], 0);
});
