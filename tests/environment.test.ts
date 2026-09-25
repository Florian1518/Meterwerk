import { describe, expect, it } from "vitest";
import {
  assertDemoResetAllowed,
  assertStagingIsolation,
  environmentLabel,
  getEnvironment,
} from "@/lib/environment";
describe("environment isolation", () => {
  it("recognizes environments", () => {
    expect(getEnvironment("demo")).toBe("demo");
    expect(getEnvironment("production")).toBe("production");
  });
  it("labels only demo and staging", () => {
    expect(environmentLabel("demo")).toBe("DEMO");
    expect(environmentLabel("staging")).toBe("STAGING");
    expect(environmentLabel("production")).toBe("");
  });
  it("guards reset and production endpoints", () => {
    expect(assertDemoResetAllowed("demo", "I_UNDERSTAND_DEMO_RESET")).toBe(
      true,
    );
    expect(() =>
      assertDemoResetAllowed("production", "I_UNDERSTAND_DEMO_RESET"),
    ).toThrow();
    expect(() =>
      assertStagingIsolation("staging", {
        DATABASE_URL: "postgres://staging-db/app",
      }),
    ).not.toThrow();
    expect(() =>
      assertStagingIsolation("staging", {
        DATABASE_URL: "postgres://production-db/app",
      }),
    ).toThrow();
  });
});
