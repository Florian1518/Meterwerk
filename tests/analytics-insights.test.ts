import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { anomalyFor } from "../src/server/analytics-insights";
import { forecastValues } from "../src/server/analytics-forecast";

const date = (hour: number) =>
  new Date(`2026-01-01T${String(hour).padStart(2, "0")}:00:00Z`);
const points = (values: string[]) =>
  values.map((value, i) => ({ timestamp: date(i), value: new Decimal(value) }));

describe("regelbasierte Analytics-Anomalien", () => {
  it("erkennt Verbrauchsspitzen und hohe Grundlast", () => {
    const found = anomalyFor(
      "tenant-a",
      { id: "meter-a", propertyId: "property-a", type: "ELECTRICITY" },
      points(["10", "10", "40"]),
      points(["10", "10", "10"]),
      date(0),
      date(3),
      "UTC",
    );
    expect(found.map((item) => item.type)).toEqual(
      expect.arrayContaining(["CONSUMPTION_PEAK", "HIGH_BASE_LOAD"]),
    );
  });
  it("erkennt Wasserleck-Indikatoren bei hohem Nachtverbrauch", () => {
    const found = anomalyFor(
      "tenant-a",
      { id: "meter-a", propertyId: "property-a", type: "WATER" },
      [
        {
          timestamp: new Date("2026-01-01T23:00:00Z"),
          value: new Decimal("12"),
        },
      ],
      points(["1", "1", "1"]),
      date(0),
      date(1),
      "UTC",
    );
    expect(found.some((item) => item.type === "WATER_LEAK_INDICATOR")).toBe(
      true,
    );
  });
  it("produziert keine Warnung für konstante normale Werte", () => {
    const found = anomalyFor(
      "tenant-a",
      { id: "meter-a", propertyId: "property-a", type: "GAS" },
      points(["10", "10", "10"]),
      points(["10", "10", "10"]),
      date(0),
      date(3),
      "UTC",
    );
    expect(found.filter((item) => item.severity !== "INFO")).toHaveLength(0);
  });
  it("liefert Forecast nur mit ausreichender Datenbasis", () => {
    expect(forecastValues(["1", "2"], "day").status).toBe("insufficient_data");
    expect(
      forecastValues(
        Array.from({ length: 30 }, () => "2"),
        "week",
      ).status,
    ).toBe("ok");
  });
});
