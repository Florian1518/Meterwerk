import Decimal from "decimal.js";
import { z } from "zod";

export const utilities = ["ELECTRICITY", "WATER", "GAS", "HEAT"] as const;
export type UtilityType = (typeof utilities)[number];
const energy = { Wh: "0.001", kWh: "1", MWh: "1000" };
const power = { W: "0.001", kW: "1", MW: "1000" };
const volume = { l: "0.001", m3: "1", "m³": "1" };
const flow = { "l/min": "0.06", "m3/h": "1", "m³/h": "1" };
type Metric = {
  label: string;
  unit: string;
  factors: Record<string, string>;
  counter?: boolean;
  signed?: boolean;
};
const metric = (
  label: string,
  unit: string,
  factors: Record<string, string>,
  counter = false,
  signed = false,
): Metric => ({ label, unit, factors, counter, signed });
export const metrics = {
  ENERGY_IMPORT: metric("Importenergie", "kWh", energy, true),
  ENERGY_EXPORT: metric("Exportenergie", "kWh", energy, true),
  ENERGY_NET: metric("Nettoenergie", "kWh", energy, false, true),
  ENERGY_TOTAL: metric("Wärmeenergie", "kWh", energy, true),
  ENERGY_EQUIVALENT: metric("Gasenergie", "kWh", energy, true),
  ACTIVE_POWER: metric("Gesamtwirkleistung", "kW", power, false, true),
  ACTIVE_POWER_L1: metric("Wirkleistung L1", "kW", power, false, true),
  ACTIVE_POWER_L2: metric("Wirkleistung L2", "kW", power, false, true),
  ACTIVE_POWER_L3: metric("Wirkleistung L3", "kW", power, false, true),
  REACTIVE_POWER: metric(
    "Blindleistung",
    "kvar",
    { var: "0.001", kvar: "1" },
    false,
    true,
  ),
  VOLTAGE_L1: metric("Spannung L1", "V", { V: "1" }),
  VOLTAGE_L2: metric("Spannung L2", "V", { V: "1" }),
  VOLTAGE_L3: metric("Spannung L3", "V", { V: "1" }),
  CURRENT_L1: metric("Strom L1", "A", { A: "1" }),
  CURRENT_L2: metric("Strom L2", "A", { A: "1" }),
  CURRENT_L3: metric("Strom L3", "A", { A: "1" }),
  FREQUENCY: metric("Frequenz", "Hz", { Hz: "1" }),
  POWER_FACTOR: metric("Leistungsfaktor", "1", { "1": "1" }, false, true),
  VOLUME_TOTAL: metric("Volumenzählerstand", "m3", volume, true),
  CONSUMPTION: metric("Intervallverbrauch", "m3", volume),
  FLOW_RATE: metric("Durchfluss", "m3/h", flow, false, true),
  TEMPERATURE: metric("Temperatur", "°C", { "°C": "1", K: "1" }, false, true),
  POWER: metric("Wärmeleistung", "kW", power),
  SUPPLY_TEMPERATURE: metric(
    "Vorlauftemperatur",
    "°C",
    { "°C": "1", K: "1" },
    false,
    true,
  ),
  RETURN_TEMPERATURE: metric(
    "Rücklauftemperatur",
    "°C",
    { "°C": "1", K: "1" },
    false,
    true,
  ),
  DELTA_T: metric(
    "Temperaturdifferenz",
    "K",
    { K: "1", "°C": "1" },
    false,
    true,
  ),
} satisfies Record<string, Metric>;
export type MetricName = keyof typeof metrics;
export const profiles: Record<
  UtilityType,
  { label: string; primary: MetricName; metrics: MetricName[] }
> = {
  ELECTRICITY: {
    label: "Strom",
    primary: "ENERGY_IMPORT",
    metrics: [
      "ENERGY_IMPORT",
      "ENERGY_EXPORT",
      "ENERGY_NET",
      "ACTIVE_POWER",
      "ACTIVE_POWER_L1",
      "ACTIVE_POWER_L2",
      "ACTIVE_POWER_L3",
      "REACTIVE_POWER",
      "VOLTAGE_L1",
      "VOLTAGE_L2",
      "VOLTAGE_L3",
      "CURRENT_L1",
      "CURRENT_L2",
      "CURRENT_L3",
      "FREQUENCY",
      "POWER_FACTOR",
    ],
  },
  WATER: {
    label: "Wasser",
    primary: "VOLUME_TOTAL",
    metrics: ["VOLUME_TOTAL", "CONSUMPTION", "FLOW_RATE", "TEMPERATURE"],
  },
  GAS: {
    label: "Gas",
    primary: "VOLUME_TOTAL",
    metrics: ["VOLUME_TOTAL", "CONSUMPTION", "ENERGY_EQUIVALENT", "FLOW_RATE"],
  },
  HEAT: {
    label: "Wärme",
    primary: "ENERGY_TOTAL",
    metrics: [
      "ENERGY_TOTAL",
      "VOLUME_TOTAL",
      "POWER",
      "FLOW_RATE",
      "SUPPLY_TEMPERATURE",
      "RETURN_TEMPERATURE",
      "DELTA_T",
    ],
  },
};
export const decimalInput = z.string().regex(/^-?\d{1,14}(\.\d{1,6})?$/);
export const measurementSchema = z
  .object({
    metric: z.enum(Object.keys(metrics) as [MetricName, ...MetricName[]]),
    value: decimalInput,
    unit: z.string().max(12),
    quality: z
      .enum(["VALID", "ESTIMATED", "INVALID", "SUSPECT"])
      .default("VALID"),
  })
  .strict();
export const utilityPayload = z
  .object({
    messageId: z.string().min(1).max(160),
    timestamp: z.iso.datetime({ offset: true }),
    measurements: z.array(measurementSchema).min(1).max(32),
  })
  .strict();
export function normalize(
  utility: UtilityType,
  input: z.infer<typeof measurementSchema>,
) {
  if (!profiles[utility].metrics.includes(input.metric))
    throw new Error("Messgröße passt nicht zum Medium.");
  const definition: Metric = metrics[input.metric];
  const factor = definition.factors[input.unit];
  if (!factor) throw new Error("Einheit passt nicht zur Messgröße.");
  let value = new Decimal(input.value).mul(factor);
  if (definition.unit === "°C" && input.unit === "K")
    value = value.minus("273.15");
  if (value.abs().gte("100000000000000"))
    throw new Error("Messwert außerhalb des Wertebereichs.");
  const invalid =
    (!definition.signed && value.isNegative()) ||
    (input.metric === "POWER_FACTOR" && value.abs().gt(1));
  return {
    metric: input.metric,
    rawValue: input.value,
    rawUnit: input.unit,
    value: value.toFixed(6),
    unit: definition.unit,
    quality: invalid ? ("INVALID" as const) : input.quality,
  };
}
export function gasEnergy(
  m3: Decimal.Value,
  condition: Decimal.Value,
  calorific: Decimal.Value,
) {
  if (new Decimal(condition).lte(0) || new Decimal(calorific).lte(0))
    throw new Error("Gasfaktoren müssen positiv sein.");
  return new Decimal(m3).mul(condition).mul(calorific);
}

export function comparisonPeriods(now: Date) {
  const y = now.getUTCFullYear(),
    m = now.getUTCMonth(),
    d = now.getUTCDate();
  const date = (year: number, month: number, day = 1) =>
    new Date(Date.UTC(year, month, day));
  return {
    today: [date(y, m, d), now],
    yesterday: [date(y, m, d - 1), date(y, m, d)],
    month: [date(y, m), now],
    previousMonth: [date(y, m - 1), date(y, m)],
    previousYearMonth: [date(y - 1, m), date(y - 1, m + 1)],
    year: [date(y, 0), now],
    previousYear: [date(y - 1, 0), date(y, 0)],
  };
}

export type Price = {
  validFrom: Date;
  validTo: Date | null;
  price: Decimal.Value;
  unit: string;
  basePerDay: Decimal.Value;
  condition: Decimal.Value | null;
  calorific: Decimal.Value | null;
};
export function intervalCost(
  consumption: Decimal.Value,
  unit: string,
  timestamp: Date,
  tariffs: Price[],
) {
  const tariff = tariffs.find(
    (t) => t.validFrom <= timestamp && (!t.validTo || timestamp < t.validTo),
  );
  if (!tariff) return null;
  let amount = new Decimal(consumption);
  if (unit === "m3" && tariff.unit === "kWh") {
    if (tariff.condition === null || tariff.calorific === null) return null;
    amount = gasEnergy(amount, tariff.condition, tariff.calorific);
  } else if (unit === "kWh" && tariff.unit === "MWh") amount = amount.div(1000);
  else if (unit !== tariff.unit) throw new Error("Tarifeinheit passt nicht.");
  return amount.mul(tariff.price);
}
