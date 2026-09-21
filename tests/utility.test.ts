import { describe, expect, it } from "vitest";
import {
  gasEnergy,
  intervalCost,
  timeProportionalCost,
  measurementSchema,
  normalize,
  profiles,
  utilities,
  utilityPayload,
  comparisonPeriods,
} from "../src/lib/utility";
import {
  VirtualElectricityMeter,
  VirtualWaterMeter,
  VirtualGasMeter,
  VirtualHeatMeter,
} from "../src/lib/utility-simulator";
import { evaluateUtilityAlarms } from "../src/lib/utility-alarms";
describe("Multi-Utility", () => {
  it.each([
    ["ENERGY_IMPORT", "1000", "Wh", "1.000000"],
    ["ENERGY_IMPORT", "1", "MWh", "1000.000000"],
    ["ACTIVE_POWER", "1000", "W", "1.000000"],
  ])("normalizes electricity %s %s %s", (metric, value, unit, expected) =>
    expect(
      normalize("ELECTRICITY", measurementSchema.parse({ metric, value, unit }))
        .value,
    ).toBe(expected),
  );
  it("normalizes litres and flow without mixing dimensions", () => {
    expect(
      normalize(
        "WATER",
        measurementSchema.parse({
          metric: "VOLUME_TOTAL",
          value: "1000",
          unit: "l",
        }),
      ).value,
    ).toBe("1.000000");
    expect(
      normalize(
        "WATER",
        measurementSchema.parse({
          metric: "FLOW_RATE",
          value: "1",
          unit: "l/min",
        }),
      ).value,
    ).toBe("0.060000");
    expect(() =>
      normalize(
        "WATER",
        measurementSchema.parse({
          metric: "VOLUME_TOTAL",
          value: "1",
          unit: "kWh",
        }),
      ),
    ).toThrow();
  });
  it("isolates profiles and validates payloads", () => {
    expect(() =>
      normalize(
        "WATER",
        measurementSchema.parse({
          metric: "VOLTAGE_L1",
          value: "230",
          unit: "V",
        }),
      ),
    ).toThrow();
    expect(() =>
      utilityPayload.parse({ tenantId: "foreign", measurements: [] }),
    ).toThrow();
    expect(profiles.ELECTRICITY.metrics).not.toContain("SUPPLY_TEMPERATURE");
    expect(utilities).toHaveLength(4);
  });
  it("keeps temperature offsets separate from differences", () => {
    expect(
      normalize(
        "HEAT",
        measurementSchema.parse({
          metric: "SUPPLY_TEMPERATURE",
          value: "300",
          unit: "K",
        }),
      ).value,
    ).toBe("26.850000");
    expect(
      normalize(
        "HEAT",
        measurementSchema.parse({ metric: "DELTA_T", value: "10", unit: "°C" }),
      ).value,
    ).toBe("10.000000");
  });
  it("requires explicit gas factors", () => {
    expect(gasEnergy("10", "0.95", "11.2").toString()).toBe("106.4");
    expect(() => gasEnergy("10", "0", "11.2")).toThrow();
  });
  it("applies historical tariffs at exact boundaries using decimals", () => {
    const start = new Date("2026-01-01Z"),
      change = new Date("2026-02-01Z");
    const prices = [
      {
        validFrom: start,
        validTo: change,
        price: "0.1",
        basePerDay: "0",
        unit: "kWh",
        condition: null,
        calorific: null,
      },
      {
        validFrom: change,
        validTo: null,
        price: "0.2",
        basePerDay: "0",
        unit: "kWh",
        condition: null,
        calorific: null,
      },
    ];
    expect(intervalCost("3", "kWh", start, prices)?.toString()).toBe("0.3");
    expect(intervalCost("3", "kWh", change, prices)?.toString()).toBe("0.6");
    expect(
      intervalCost("3", "kWh", new Date("2025-01-01Z"), prices),
    ).toBeNull();
    expect(
      intervalCost("1000", "kWh", start, [
        { ...prices[0], unit: "MWh", price: "90" },
      ])?.toString(),
    ).toBe("90");
  });
  it("uses explicit UTC comparison boundaries", () => {
    const p = comparisonPeriods(new Date("2026-01-01T12:00:00Z"));
    expect(p.previousMonth[0].toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(p.yesterday[0].toISOString()).toBe("2025-12-31T00:00:00.000Z");
  });
  it("splits an interval across a tariff boundary without rewriting history", () => {
    const start = new Date("2026-01-01T00:00:00Z"),
      change = new Date("2026-01-01T01:00:00Z"),
      end = new Date("2026-01-01T02:00:00Z");
    const tariffs = [
      {
        validFrom: start,
        validTo: change,
        price: "1",
        unit: "kWh",
        basePerDay: "0",
        condition: null,
        calorific: null,
      },
      {
        validFrom: change,
        validTo: null,
        price: "3",
        unit: "kWh",
        basePerDay: "0",
        condition: null,
        calorific: null,
      },
    ];
    expect(
      timeProportionalCost("2", "kWh", start, end, tariffs)?.toString(),
    ).toBe("4");
  });
  it("simulates all utilities through the shared payload contract", () => {
    for (const simulator of [
      new VirtualElectricityMeter(),
      new VirtualWaterMeter(),
      new VirtualGasMeter(),
      new VirtualHeatMeter(),
    ]) {
      const frame = utilityPayload.parse(
        simulator.sample(new Date("2026-01-01T08:00:00Z")),
      );
      expect(
        frame.measurements.every((m) => normalize(simulator.utility, m)),
      ).toBe(true);
    }
  });
  it("simulates night leakage and dependent heat values", () => {
    const date = new Date("2026-01-01T02:00:00Z");
    const flow = (leak: boolean) =>
      new VirtualWaterMeter("0", leak)
        .sample(date)
        .measurements.find((m) => m.metric === "FLOW_RATE")!.value;
    expect(flow(false)).toBe("0.000000");
    expect(flow(true)).toBe("0.025000");
    const heat = Object.fromEntries(
      new VirtualHeatMeter()
        .sample(date)
        .measurements.map((m) => [m.metric, m.value]),
    );
    expect(
      Number(heat.SUPPLY_TEMPERATURE) - Number(heat.RETURN_TEMPERATURE),
    ).toBe(Number(heat.DELTA_T));
    expect(Number(heat.POWER)).toBeCloseTo(
      Number(heat.FLOW_RATE) * Number(heat.DELTA_T) * 1.163,
    );
  });
  it("evaluates configurable alarms conservatively", () => {
    expect(
      evaluateUtilityAlarms(
        "WATER",
        { FLOW_RATE: "0.025" },
        {},
        "0.1",
        false,
        false,
        false,
      ).LEAK_SUSPECTED,
    ).toBe(false);
    expect(
      evaluateUtilityAlarms(
        "WATER",
        { FLOW_RATE: "0.025" },
        {},
        "0.1",
        true,
        false,
        false,
      ).LEAK_SUSPECTED,
    ).toBe(true);
    expect(
      evaluateUtilityAlarms(
        "HEAT",
        { SUPPLY_TEMPERATURE: "40", RETURN_TEMPERATURE: "60" },
        {},
        "0",
        false,
        false,
        false,
      ).TEMPERATURE_ANOMALY,
    ).toBe(true);
    expect(
      evaluateUtilityAlarms(
        "WATER",
        { FLOW_RATE: "-1" },
        { allowReverse: true },
        "0",
        false,
        false,
        false,
      ).REVERSE_FLOW,
    ).toBe(false);
  });
});
