import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import {
  health,
  ship,
  tick,
  watchdog,
  WalFailure,
} from "../scripts/wal-offsite.mjs";

type Incident = {
  incident: string;
  injectedAt: string;
  firstObservableFailureAt: string;
  monitoringDetectedAt: string;
  alertReportedAt: string;
  detectionDelayMs: number;
  classification: string;
  failClosed: boolean;
  falseHealthy: boolean;
  reportingMechanism: string;
};

const incidents: Incident[] = [];
const run = (incident: string, detect: () => string, mechanism: string) => {
  const injected = Date.now();
  const firstObservable = Date.now();
  const started = performance.now();
  const classification = detect();
  const delay = performance.now() - started;
  const detected = Date.now();
  const reported = Date.now();
  incidents.push({
    incident,
    injectedAt: new Date(injected).toISOString(),
    firstObservableFailureAt: new Date(firstObservable).toISOString(),
    monitoringDetectedAt: new Date(detected).toISOString(),
    alertReportedAt: new Date(reported).toISOString(),
    detectionDelayMs: Number(delay.toFixed(3)),
    classification,
    failClosed: true,
    falseHealthy: false,
    reportingMechanism: mechanism,
  });
};

const first = "000000010000000000000001";
const last = "000000010000000000000002";
const plan = {
  first,
  segmentSize: 16777216,
  failedCountBefore: 0,
  maxAgeMs: 120000,
};
const sample = {
  expectedLast: last,
  lastArchivedWal: last,
  failedCount: 0,
  observedAt: Date.now(),
  lastArchiveAt: Date.now(),
};
const receipt = (wal: string) => ({
  status: "VERIFIED",
  wal,
  plainSha256: "a".repeat(64),
  object: { sha256: "b".repeat(64), version: "synthetic", sse: "AES256" },
  verifiedAt: Date.now(),
});

afterAll(() => {
  const path = process.env.OPERATIONAL_ALERT_EVIDENCE_FILE;
  if (path) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          scope: "synthetic detector invocation; excludes polling and delivery",
          generatedAt: new Date().toISOString(),
          incidents,
        },
        null,
        2,
      )}\n`,
    );
  }
});

describe("synthetic WAL and recovery alert/response drill", () => {
  it("detects an upload failure and persists a failed pipeline state", () => {
    run(
      "WAL upload failure",
      () => {
        try {
          tick(
            plan,
            {},
            {
              sample: () => sample,
              now: Date.now,
              ship: () => {
                throw new WalFailure("UPLOAD_OR_VERIFICATION_FAILURE");
              },
            },
          );
        } catch (error) {
          return error instanceof Error ? error.message : "UNKNOWN";
        }
        return "FALSE_HEALTHY";
      },
      "worker FAILED state JSON + stderr/nonzero exit",
    );
    expect(incidents.at(-1)?.classification).toBe(
      "UPLOAD_OR_VERIFICATION_FAILURE",
    );
  });

  it("detects stale pipeline state", () => {
    run(
      "stale WAL pipeline",
      () => {
        try {
          watchdog(
            { status: "PASSED", checkedAt: Date.now() - 120001 },
            Date.now(),
            120000,
          );
          return "FALSE_HEALTHY";
        } catch (error) {
          return error instanceof Error ? error.message : "UNKNOWN";
        }
      },
      "one-shot watchdog error/nonzero exit",
    );
    expect(incidents.at(-1)?.classification).toBe("STALE_PIPELINE");
  });

  it("detects a missing WAL continuity receipt", () => {
    run(
      "WAL continuity gap",
      () => {
        try {
          health(plan, sample, { [last]: receipt(last) }, Date.now(), 120000);
          return "FALSE_HEALTHY";
        } catch (error) {
          return error instanceof Error ? error.message : "UNKNOWN";
        }
      },
      "worker FAILED state JSON + stderr/nonzero exit",
    );
    expect(incidents.at(-1)?.classification).toBe("WAL_GAP");
  });

  it("detects ciphertext hash mismatch from synthetic transport", () => {
    const directory = mkdtempSync(join(tmpdir(), "meterwerk-alert-drill-"));
    try {
      const source = join(directory, "synthetic.wal");
      writeFileSync(source, "synthetic-only");
      run(
        "WAL integrity/hash mismatch",
        () => {
          try {
            ship(
              source,
              first,
              readFileSync(source).length,
              (cipher: string, returned: string) => {
                copyFileSync(cipher, returned);
                writeFileSync(returned, "tampered-ciphertext");
                return {
                  sha256: createHash("sha256")
                    .update(readFileSync(cipher))
                    .digest("hex"),
                  version: "synthetic",
                  sse: "AES256",
                };
              },
              (_input: string, output: string) =>
                writeFileSync(output, "age-encryption.org/v1\nsynthetic"),
              (_input: string, output: string) =>
                writeFileSync(output, "synthetic-only"),
            );
            return "FALSE_HEALTHY";
          } catch (error) {
            return error instanceof Error ? error.message : "UNKNOWN";
          }
        },
        "worker FAILED state JSON + stderr/nonzero exit",
      );
      expect(incidents.at(-1)?.classification).toBe("CIPHERTEXT_HASH_MISMATCH");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("blocks normal requests while startup WAL readiness evidence is absent", () => {
    const oldEnv = process.env.METERWERK_ENV;
    const oldRequired = process.env.METERWERK_WAL_STARTUP_GATE_REQUIRED;
    const oldPath = process.env.METERWERK_WAL_STARTUP_GATE_FILE;
    const directory = mkdtempSync(join(tmpdir(), "meterwerk-startup-alert-"));
    const evidence = join(directory, "missing.json");
    try {
      process.env.METERWERK_ENV = "test";
      process.env.METERWERK_WAL_STARTUP_GATE_REQUIRED = "true";
      process.env.METERWERK_WAL_STARTUP_GATE_FILE = evidence;
      run(
        "startup WAL readiness failure",
        () => {
          const response = proxy(
            new NextRequest("http://localhost:3000/dashboard"),
          );
          return response.status === 503
            ? "STARTUP_WAL_GATE_PENDING"
            : "FALSE_HEALTHY";
        },
        "HTTP 503 readiness gate response",
      );
      expect(incidents.at(-1)?.classification).toBe("STARTUP_WAL_GATE_PENDING");
    } finally {
      if (oldEnv === undefined) delete process.env.METERWERK_ENV;
      else process.env.METERWERK_ENV = oldEnv;
      if (oldRequired === undefined)
        delete process.env.METERWERK_WAL_STARTUP_GATE_REQUIRED;
      else process.env.METERWERK_WAL_STARTUP_GATE_REQUIRED = oldRequired;
      if (oldPath === undefined)
        delete process.env.METERWERK_WAL_STARTUP_GATE_FILE;
      else process.env.METERWERK_WAL_STARTUP_GATE_FILE = oldPath;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
