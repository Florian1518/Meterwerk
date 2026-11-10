import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "../src/proxy";

const originalEnvironment = process.env.METERWERK_ENV;
const originalTrustedHosts = process.env.TRUSTED_HOSTS;
const originalStartupGateRequired =
  process.env.METERWERK_WAL_STARTUP_GATE_REQUIRED;
const originalStartupGateFile = process.env.METERWERK_WAL_STARTUP_GATE_FILE;

afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.METERWERK_ENV;
  else process.env.METERWERK_ENV = originalEnvironment;
  if (originalTrustedHosts === undefined) delete process.env.TRUSTED_HOSTS;
  else process.env.TRUSTED_HOSTS = originalTrustedHosts;
  if (originalStartupGateRequired === undefined)
    delete process.env.METERWERK_WAL_STARTUP_GATE_REQUIRED;
  else
    process.env.METERWERK_WAL_STARTUP_GATE_REQUIRED =
      originalStartupGateRequired;
  if (originalStartupGateFile === undefined)
    delete process.env.METERWERK_WAL_STARTUP_GATE_FILE;
  else process.env.METERWERK_WAL_STARTUP_GATE_FILE = originalStartupGateFile;
});

describe("production proxy healthcheck contract", () => {
  it("uses the trusted TLS-proxy headers for the internal readiness probe", () => {
    process.env.METERWERK_ENV = "production";
    process.env.TRUSTED_HOSTS = "localhost,127.0.0.1";
    const dockerfile = readFileSync(resolve("Dockerfile"), "utf8");
    expect(dockerfile).toMatch(/HEALTHCHECK[^\n]*x-forwarded-proto: https/);
    expect(dockerfile).toMatch(/HEALTHCHECK[^\n]*x-forwarded-host: localhost/);
    expect(dockerfile).toMatch(/HEALTHCHECK[^\n]*\/api\/health\/ready/);

    const response = proxy(
      new NextRequest("http://127.0.0.1:3000/api/health/ready", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "localhost",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("strict-transport-security")).toContain(
      "max-age=31536000",
    );
  });

  it("still redirects trusted plain-HTTP requests to HTTPS", () => {
    process.env.METERWERK_ENV = "production";
    process.env.TRUSTED_HOSTS = "localhost,127.0.0.1";
    const response = proxy(
      new NextRequest("http://127.0.0.1:3000/login", {
        headers: {
          host: "localhost:3000",
          "x-forwarded-host": "localhost",
          "x-forwarded-proto": "http",
        },
      }),
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toMatch(/^https:\/\//);
  });

  it("continues rejecting untrusted hosts even with proxy headers", () => {
    process.env.METERWERK_ENV = "production";
    process.env.TRUSTED_HOSTS = "localhost,127.0.0.1";
    const response = proxy(
      new NextRequest("http://127.0.0.1:3000/api/health/ready", {
        headers: {
          host: "attacker.example",
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "https",
        },
      }),
    );
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(421);
  });

  it("blocks normal application requests until startup WAL evidence is verified", () => {
    process.env.METERWERK_ENV = "test";
    process.env.METERWERK_WAL_STARTUP_GATE_REQUIRED = "true";
    const directory = mkdtempSync(join(tmpdir(), "meterwerk-proxy-wal-gate-"));
    const evidencePath = join(directory, "readiness.json");
    process.env.METERWERK_WAL_STARTUP_GATE_FILE = evidencePath;
    const request = () =>
      proxy(new NextRequest("http://localhost:3000/dashboard"));

    try {
      expect(request().status).toBe(503);
      expect(
        proxy(new NextRequest("http://localhost:3000/api/health/ready")).status,
      ).toBe(200);
      const wal = "000000010000000000000001";
      writeFileSync(
        evidencePath,
        JSON.stringify({
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
        }),
      );
      expect(request().status).toBe(200);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
