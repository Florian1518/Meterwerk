import { describe, expect, it } from "vitest";
import { AccessError } from "@/server/policy";
import {
  assertDrillEnvironment,
  drillStatusFor,
  evaluateRecoveryTarget,
  failureScenarioCatalog,
  rtoSeconds,
} from "@/server/disaster-recovery";

describe("DR recovery regression", () => {
  it("covers all required failure scenarios", () => {
    expect(failureScenarioCatalog).toEqual(
      expect.arrayContaining([
        "web-app",
        "postgresql",
        "mqtt",
        "object-storage",
        "multi-worker",
        "secret-rotation",
      ]),
    );
  });
  it("only permits explicitly isolated drill environments", () => {
    expect(assertDrillEnvironment("staging")).toBe("staging");
    expect(() => assertDrillEnvironment("production")).toThrow(AccessError);
  });
  it("evaluates RPO/RTO without inventing missing measurements", () => {
    expect(evaluateRecoveryTarget(undefined, 1)).toBe("UNKNOWN");
    expect(evaluateRecoveryTarget(60, 30)).toBe("PASSED");
    expect(evaluateRecoveryTarget(60, 90)).toBe("FAILED");
    expect(
      rtoSeconds(
        new Date("2026-01-01T00:00:00Z"),
        new Date("2026-01-01T00:01:00Z"),
      ),
    ).toBe(60);
  });
  it("classifies drill findings", () => {
    expect(drillStatusFor(0, true)).toBe("PASSED");
    expect(drillStatusFor(1, true)).toBe("PASSED_WITH_FINDINGS");
    expect(drillStatusFor(0, false)).toBe("FAILED");
  });
});
