import { describe, expect, it } from "vitest";
import {
  consumptionProfile,
  detectConsumptionAnomalies,
  benchmarkPerArea,
} from "@/lib/analytics";
describe("energy analytics", () => {
  it("aggregates UTC quarter-hour buckets", () => {
    const result = consumptionProfile(
      [
        { timestamp: new Date("2026-01-01T00:01:00Z"), value: "1.2" },
        { timestamp: new Date("2026-01-01T00:14:00Z"), value: "0.8" },
        { timestamp: new Date("2026-01-01T00:16:00Z"), value: 2 },
      ],
      "15_MINUTES",
    );
    expect(result).toEqual([
      { timestamp: "2026-01-01T00:00:00.000Z", value: "2" },
      { timestamp: "2026-01-01T00:15:00.000Z", value: "2" },
    ]);
  });
  it("detects spikes and continuous consumption", () => {
    const result = detectConsumptionAnomalies([1, 1, 1, 3, 1, 1, 1]);
    expect(result.some((x) => x.kind === "SPIKE")).toBe(true);
    expect(result.some((x) => x.kind === "CONTINUOUS_CONSUMPTION")).toBe(true);
  });
  it("benchmarks by area without mixing units", () => {
    expect(benchmarkPerArea("100", "25")).toBe("4");
    expect(benchmarkPerArea(1, 0)).toBeNull();
  });
});
