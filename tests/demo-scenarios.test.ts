import { describe, expect, it } from "vitest";
import {
  DEMO_SCENARIOS,
  assertDemoScenario,
  assertDemoScenarioEnvironment,
} from "@/server/demo-scenarios";
describe("demo scenarios", () => {
  it("contains the supported deterministic scenarios", () => {
    expect(DEMO_SCENARIOS).toHaveLength(13);
    expect(DEMO_SCENARIOS).toContain("WATER_LEAK");
  });
  it("guards environment and values", () => {
    expect(assertDemoScenarioEnvironment("demo")).toBe("demo");
    expect(() => assertDemoScenarioEnvironment("production")).toThrow();
    expect(assertDemoScenario("METER_OFFLINE")).toBe("METER_OFFLINE");
    expect(() => assertDemoScenario("UNKNOWN")).toThrow();
  });
});
