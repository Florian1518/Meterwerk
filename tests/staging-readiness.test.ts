import { describe, expect, it } from "vitest";
import { canPromote, evaluateStagingReadiness } from "@/lib/staging-readiness";
describe("staging readiness", () => {
  it("classifies readiness conservatively", () => {
    expect(
      evaluateStagingReadiness({
        web: true,
        database: true,
        mqtt: true,
        rulesWorker: true,
        deviceWorker: true,
        migrations: true,
        buildVersion: true,
        gitSha: true,
      }),
    ).toBe("READY");
    expect(
      evaluateStagingReadiness({
        web: true,
        database: true,
        mqtt: true,
        rulesWorker: true,
        deviceWorker: true,
        migrations: true,
        buildVersion: true,
        gitSha: true,
        storage: false,
      }),
    ).toBe("DEGRADED");
    expect(evaluateStagingReadiness({ web: true })).toBe("UNKNOWN");
  });
  it("blocks promotion for every failed gate", () => {
    const base = {
      ci: true,
      migration: true,
      readiness: "READY" as const,
      e2e: true,
      security: true,
      versionMatches: true,
      shaMatches: true,
    };
    expect(canPromote(base)).toBe(true);
    expect(canPromote({ ...base, readiness: "DEGRADED" })).toBe(false);
    expect(canPromote({ ...base, e2e: false })).toBe(false);
  });
});
