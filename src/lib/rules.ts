import { z } from "zod";

export const ruleTriggers = [
  "READING_CREATED",
  "ALARM_CREATED",
  "ALARM_STATUS_CHANGED",
  "METER_ONLINE",
  "METER_OFFLINE",
  "GATEWAY_ONLINE",
  "GATEWAY_OFFLINE",
  "SCHEDULED_CHECK",
] as const;
export type RuleTrigger = (typeof ruleTriggers)[number];

const numberValue = z
  .number()
  .finite()
  .or(z.string().regex(/^-?\d+(?:\.\d+)?$/));
const baseCondition = z.object({
  field: z.enum([
    "consumption",
    "registerValue",
    "meterValue",
    "offlineMinutes",
    "missingMinutes",
  ]),
});
export const conditionSchema = z.discriminatedUnion("operator", [
  baseCondition
    .extend({
      operator: z.literal("GREATER_THAN"),
      value: numberValue,
    })
    .strict(),
  baseCondition
    .extend({
      operator: z.literal("LESS_THAN"),
      value: numberValue,
    })
    .strict(),
  baseCondition
    .extend({ operator: z.literal("EQUALS"), value: numberValue })
    .strict(),
  baseCondition
    .extend({
      operator: z.literal("BETWEEN"),
      min: numberValue,
      max: numberValue,
    })
    .strict(),
  z
    .object({
      operator: z.literal("TIME_WINDOW"),
      from: z.string().regex(/^\d{2}:\d{2}$/),
      to: z.string().regex(/^\d{2}:\d{2}$/),
      timezone: z.literal("UTC").default("UTC"),
    })
    .strict(),
  z
    .object({
      operator: z.literal("MEDIUM_EQUALS"),
      medium: z.enum(["ELECTRICITY", "WATER", "GAS", "HEAT"]),
    })
    .strict(),
  z
    .object({
      operator: z.literal("METER_EQUALS"),
      meterId: z.string().min(1).max(160),
    })
    .strict(),
  z
    .object({
      operator: z.literal("PROPERTY_EQUALS"),
      propertyId: z.string().min(1).max(160),
    })
    .strict(),
  z
    .object({
      operator: z.literal("DURATION_AT_LEAST"),
      field: z.enum(["offlineMinutes", "missingMinutes", "durationMinutes"]),
      minutes: z.number().int().positive().max(525600),
    })
    .strict(),
  z
    .object({
      operator: z.literal("AND"),
      conditions: z.array(z.unknown()).min(1).max(5),
    })
    .strict(),
  z
    .object({
      operator: z.literal("OR"),
      conditions: z.array(z.unknown()).min(1).max(5),
    })
    .strict(),
]);
export const actionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("CREATE_ALARM"),
      title: z.string().trim().min(1).max(160),
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_METER_STATUS"),
      status: z.enum(["ACTIVE", "OFFLINE", "MAINTENANCE"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("UPDATE_ALARM"),
      alarmId: z.string().min(1).max(160).optional(),
      status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
      title: z.string().trim().min(1).max(160).optional(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    })
    .strict()
    .refine((v) => v.status || v.title || v.severity, {
      message: "Alarmänderung benötigt mindestens ein Feld.",
    }),
  z
    .object({
      type: z.literal("WEBHOOK"),
      event: z.enum([
        "meter.reading.received",
        "meter.offline",
        "meter.online",
        "gateway.offline",
        "gateway.online",
        "alarm.created",
        "alarm.acknowledged",
        "alarm.resolved",
        "report.ready",
      ]),
      payload: z
        .record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.null()]),
        )
        .default({}),
    })
    .strict(),
  z
    .object({
      type: z.literal("EMAIL"),
      to: z.array(z.string().email()).min(1).max(10),
      subject: z.string().trim().min(1).max(200),
      body: z.string().min(1).max(10000),
      template: z.enum(["ALARM", "SYSTEM", "REPORT"]).default("SYSTEM"),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_GATEWAY_STATUS"),
      gatewayId: z.string().min(1).max(160).optional(),
      status: z.enum([
        "ONLINE",
        "OFFLINE",
        "WARNING",
        "MAINTENANCE",
        "DISABLED",
      ]),
    })
    .strict(),
]);
export const ruleDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(2000),
    active: z.boolean().default(true),
    propertyId: z.string().trim().min(1).max(160).nullable().optional(),
    meterId: z.string().trim().min(1).max(160).nullable().optional(),
    gatewayId: z.string().trim().min(1).max(160).nullable().optional(),
    medium: z
      .enum(["ELECTRICITY", "WATER", "GAS", "HEAT"])
      .nullable()
      .optional(),
    trigger: z.enum(ruleTriggers),
    conditions: z.array(conditionSchema).max(20),
    actions: z.array(actionSchema).min(1).max(10),
    priority: z.number().int().min(0).max(10000).default(100),
    cooldownSeconds: z.number().int().min(0).max(31536000).default(0),
    maxExecutionsPerHour: z.number().int().min(0).max(10000).default(0),
    scheduleIntervalSeconds: z.number().int().min(30).max(86400).default(300),
  })
  .strict();
export type RuleCondition = z.infer<typeof conditionSchema>;
export type RuleAction = z.infer<typeof actionSchema>;

export function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))
    return Number(value);
  return null;
}
function minutesSince(value: Date | null | undefined, now: Date) {
  return value ? Math.max(0, (now.getTime() - value.getTime()) / 60000) : null;
}
function inTimeWindow(now: Date, from: string, to: string) {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const start = Number(from.slice(0, 2)) * 60 + Number(from.slice(3));
  const end = Number(to.slice(0, 2)) * 60 + Number(to.slice(3));
  return start <= end
    ? minute >= start && minute <= end
    : minute >= start || minute <= end;
}

export type RuleEvent = {
  trigger: RuleTrigger;
  eventKey: string;
  occurredAt?: Date;
  meter?: {
    id: string;
    propertyId: string;
    type: string;
    status: string;
    lastContact: Date | null;
    installedAt: Date;
  };
  gateway?: { id: string; status: string; lastSeenAt: Date | null };
  reading?: {
    consumption: string;
    registerValue: string;
    meterValue: string | null;
    timestamp: Date;
  };
  alarm?: { id: string; status: string; meterId: string };
  offlineMinutes?: number;
  missingMinutes?: number;
  durationMinutes?: number;
  correlationId?: string;
  chainDepth?: number;
};

export function matchesCondition(
  condition: RuleCondition,
  event: RuleEvent,
  now = event.occurredAt ?? new Date(),
  depth = 0,
): boolean {
  if (depth > 3) return false;
  switch (condition.operator) {
    case "AND":
      return condition.conditions.every((nested) =>
        matchesCondition(conditionSchema.parse(nested), event, now, depth + 1),
      );
    case "OR":
      return condition.conditions.some((nested) =>
        matchesCondition(conditionSchema.parse(nested), event, now, depth + 1),
      );
    case "MEDIUM_EQUALS":
      return event.meter?.type === condition.medium;
    case "METER_EQUALS":
      return event.meter?.id === condition.meterId;
    case "PROPERTY_EQUALS":
      return event.meter?.propertyId === condition.propertyId;
    case "TIME_WINDOW":
      return inTimeWindow(now, condition.from, condition.to);
    case "DURATION_AT_LEAST": {
      const actual =
        condition.field === "offlineMinutes"
          ? (event.offlineMinutes ??
            minutesSince(event.meter?.lastContact, now))
          : condition.field === "missingMinutes"
            ? (event.missingMinutes ?? null)
            : (event.durationMinutes ?? null);
      return actual !== null && actual >= condition.minutes;
    }
    default: {
      const raw =
        condition.field === "offlineMinutes"
          ? event.offlineMinutes
          : condition.field === "missingMinutes"
            ? event.missingMinutes
            : event.reading?.[condition.field];
      const actual = numeric(raw);
      if (actual === null) return false;
      const value = "value" in condition ? numeric(condition.value) : null;
      if (condition.operator === "GREATER_THAN")
        return value !== null && actual > value;
      if (condition.operator === "LESS_THAN")
        return value !== null && actual < value;
      if (condition.operator === "EQUALS")
        return value !== null && actual === value;
      const min = numeric(condition.min);
      const max = numeric(condition.max);
      return min !== null && max !== null && actual >= min && actual <= max;
    }
  }
}

export function matchesRule(
  conditions: unknown,
  event: RuleEvent,
  now = event.occurredAt ?? new Date(),
) {
  return z
    .array(conditionSchema)
    .parse(conditions)
    .every((condition) => matchesCondition(condition, event, now));
}
