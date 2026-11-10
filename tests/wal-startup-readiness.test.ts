import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  startupWalGateReady,
  startupWalGateRequired,
} from "../src/server/wal-startup-readiness";

let directory: string;
let path: string;
const wal = "000000010000000000000001";
const proof = {
  status: "PASSED",
  runId: "123456-1",
  segment: wal,
  recoveryComplete: true,
  switchCount: 1,
  archiveConfirmed: true,
  receipt: {
    status: "VERIFIED",
    wal,
    plainSha256: "a".repeat(64),
    object: {
      key: `phase3-acceptance/123456-1/startup-wal/${wal}.age`,
      version: "isolated-version",
      bytes: 16787456,
      sha256: "b".repeat(64),
      sse: "AES256",
    },
  },
  naturalWarmup: {
    status: "PASSED",
    segment: "000000010000000000000002",
    naturalSwitch: true,
    preSwitchOffset: 45000,
    archiveConfirmedAt: Date.now(),
    receipt: {
      status: "VERIFIED",
      wal: "000000010000000000000002",
      plainSha256: "c".repeat(64),
      object: {
        key: "phase3-acceptance/123456-1/startup-wal/000000010000000000000002.age",
        version: "warmup-version",
        bytes: 16787456,
        sha256: "d".repeat(64),
        sse: "AES256",
      },
    },
  },
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "meterwerk-startup-gate-"));
  path = join(directory, "readiness.json");
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("startup WAL readiness", () => {
  it("requires the gate for archive-enabled PostgreSQL by default", () => {
    expect(startupWalGateRequired(undefined, "on")).toBe(true);
    expect(startupWalGateRequired(undefined, "off")).toBe(false);
    expect(startupWalGateRequired("false", "on")).toBe(true);
    expect(startupWalGateRequired("true", "off")).toBe(true);
  });

  it("fails closed when evidence is absent", () => {
    expect(startupWalGateReady(path)).toBe(false);
  });

  it("accepts only a fully confirmed startup WAL receipt", () => {
    writeFileSync(path, JSON.stringify(proof));
    expect(startupWalGateReady(path)).toBe(true);
  });

  it("rejects missing integrity, encryption, segment, or switch evidence", () => {
    for (const invalid of [
      { ...proof, switchCount: 0 },
      { ...proof, archiveConfirmed: false },
      {
        ...proof,
        receipt: {
          ...proof.receipt,
          object: { ...proof.receipt.object, sse: "" },
        },
      },
      { ...proof, receipt: { ...proof.receipt, plainSha256: "invalid" } },
      { ...proof, runId: "other-run" },
      {
        ...proof,
        naturalWarmup: { ...proof.naturalWarmup, naturalSwitch: false },
      },
    ]) {
      writeFileSync(path, JSON.stringify(invalid));
      expect(startupWalGateReady(path)).toBe(false);
    }
  });
});
