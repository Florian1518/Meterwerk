import Decimal from "decimal.js";
import { z } from "zod";
import type { MetricName, UtilityType } from "./utility";
export const utilityConfigSchema = z
  .object({
    offlineMinutes: z.number().int().min(1).max(10080).default(60),
    highConsumption: z
      .string()
      .regex(/^\d+(\.\d{1,6})?$/)
      .optional(),
    continuousHours: z.number().min(1).max(168).default(6),
    minimumFlow: z
      .string()
      .regex(/^\d+(\.\d{1,6})?$/)
      .default("0.01"),
    maxDeltaT: z.number().min(1).max(200).default(60),
    returnTolerance: z.number().min(0).max(50).default(5),
    allowReverse: z.boolean().default(false),
  })
  .strict();
export const alarmCategories = [
  "OFFLINE",
  "HIGH_CONSUMPTION",
  "CONTINUOUS_CONSUMPTION",
  "LEAK_SUSPECTED",
  "INVALID_READING",
  "REVERSE_FLOW",
  "TEMPERATURE_ANOMALY",
  "COMMUNICATION_ERROR",
  "QUALITY_WARNING",
] as const;
export function evaluateUtilityAlarms(
  utility: UtilityType,
  values: Partial<Record<MetricName, string>>,
  rawConfig: unknown,
  consumption: string,
  continuous: boolean,
  invalid: boolean,
  suspect: boolean,
) {
  const c = utilityConfigSchema.parse(rawConfig);
  const flow = new Decimal(values.FLOW_RATE ?? 0);
  const delta =
    values.SUPPLY_TEMPERATURE !== undefined &&
    values.RETURN_TEMPERATURE !== undefined
      ? new Decimal(values.SUPPLY_TEMPERATURE).minus(values.RETURN_TEMPERATURE)
      : null;
  return {
    HIGH_CONSUMPTION:
      c.highConsumption !== undefined &&
      new Decimal(consumption).gt(c.highConsumption),
    CONTINUOUS_CONSUMPTION: utility === "WATER" && continuous,
    LEAK_SUSPECTED: utility === "WATER" && continuous && flow.gt(c.minimumFlow),
    INVALID_READING: invalid,
    REVERSE_FLOW: !c.allowReverse && flow.lt(0),
    TEMPERATURE_ANOMALY:
      utility === "HEAT" &&
      !!delta &&
      (delta.lt(-c.returnTolerance) ||
        delta.gt(c.maxDeltaT) ||
        (values.DELTA_T !== undefined &&
          delta.minus(values.DELTA_T).abs().gt(2))),
    QUALITY_WARNING:
      suspect ||
      (utility === "HEAT" &&
        ((values.POWER !== undefined &&
          new Decimal(values.POWER).gt("0.1") &&
          flow.lte(0)) ||
          (flow.gt(c.minimumFlow) &&
            values.POWER !== undefined &&
            new Decimal(values.POWER).eq(0)))),
  };
}
