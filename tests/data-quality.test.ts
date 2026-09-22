import { describe, expect, it } from "vitest";
import {
  analyzeMeterQuality,
  type QualityMeter,
  type QualityReading,
} from "../src/lib/data-quality";

const meter: QualityMeter = {
  id: "meter-a",
  serialNumber: "A-1",
  type: "WATER",
  measurementUnit: "m³",
  installedAt: new Date("2024-01-01T00:00:00Z"),
  status: "ACTIVE",
};
const reading = (
  id: string,
  timestamp: string,
  registerValue: string,
  consumption = "1",
  measurementUnit = "m³",
): QualityReading => ({
  id,
  timestamp: new Date(timestamp),
  registerValue,
  consumption,
  measurementUnit,
  deviceId: null,
  deviceMeterId: null,
});
const run = (rows: QualityReading[]) =>
  analyzeMeterQuality(
    meter,
    rows,
    new Date("2025-01-01T00:00:00Z"),
    new Date("2025-02-01T00:00:00Z"),
    new Date("2025-03-01T00:00:00Z"),
  );

describe("data quality detection", () => {
  it("flags a missing active-meter series", () =>
    expect(run([]).map((x) => x.type)).toContain("MISSING_READINGS"));
  it("flags duplicate timestamps", () =>
    expect(
      run([
        reading("a", "2025-01-05T00:00:00Z", "1"),
        reading("b", "2025-01-05T00:00:00Z", "2"),
      ]).map((x) => x.type),
    ).toContain("DUPLICATE_READINGS"));
  it("flags negative values for non-electric utilities", () =>
    expect(
      run([reading("a", "2025-01-05T00:00:00Z", "1", "-1")]).map((x) => x.type),
    ).toContain("NEGATIVE_CONSUMPTION"));
  it("flags unit mismatch and counter rollback", () =>
    expect(
      run([
        reading("a", "2025-01-05T00:00:00Z", "2", "1", "kWh"),
        reading("b", "2025-01-06T00:00:00Z", "1"),
      ]).map((x) => x.type),
    ).toEqual(expect.arrayContaining(["UNIT_MISMATCH", "COUNTER_ROLLBACK"])));
  it("flags implausible timestamps and orphaned device assignment", () => {
    const row = {
      ...reading("a", "2023-12-31T00:00:00Z", "1"),
      deviceId: "device-a",
      deviceMeterId: "meter-b",
    };
    expect(run([row]).map((x) => x.type)).toEqual(
      expect.arrayContaining(["TIMESTAMP_OUT_OF_RANGE", "ORPHANED_ASSIGNMENT"]),
    );
  });
  it("flags long data gaps", () =>
    expect(
      run([
        reading("a", "2025-01-02T00:00:00Z", "1"),
        reading("b", "2025-01-25T00:00:00Z", "2"),
      ]).map((x) => x.type),
    ).toContain("DATA_GAP"));
});
