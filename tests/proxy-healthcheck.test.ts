import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "../src/proxy";

const originalEnvironment = process.env.METERWERK_ENV;
const originalTrustedHosts = process.env.TRUSTED_HOSTS;

afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.METERWERK_ENV;
  else process.env.METERWERK_ENV = originalEnvironment;
  if (originalTrustedHosts === undefined) delete process.env.TRUSTED_HOSTS;
  else process.env.TRUSTED_HOSTS = originalTrustedHosts;
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
});
