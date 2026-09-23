import { describe, expect, it } from "vitest";
import {
  matchesCondition,
  matchesRule,
  actionSchema,
  ruleDefinitionSchema,
} from "../src/lib/rules";

const event = {
  trigger: "READING_CREATED" as const,
  eventKey: "reading-1",
  occurredAt: new Date("2026-01-01T23:30:00Z"),
  meter: {
    id: "meter-1",
    propertyId: "property-1",
    type: "WATER",
    status: "ACTIVE",
    lastContact: null,
    installedAt: new Date("2025-01-01T00:00:00Z"),
  },
  reading: {
    consumption: "12.5",
    registerValue: "100",
    meterValue: null,
    timestamp: new Date("2026-01-01T23:30:00Z"),
  },
};
describe("structured rules", () => {
  it("evaluates numeric, medium, scope and time window conditions", () => {
    expect(
      matchesCondition(
        { operator: "GREATER_THAN", field: "consumption", value: 10 },
        event,
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        {
          operator: "DURATION_AT_LEAST",
          field: "durationMinutes",
          minutes: 15,
        },
        { ...event, durationMinutes: 15 },
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        { operator: "BETWEEN", field: "consumption", min: 12, max: 13 },
        event,
      ),
    ).toBe(true);
    expect(
      matchesCondition({ operator: "MEDIUM_EQUALS", medium: "WATER" }, event),
    ).toBe(true);
    expect(
      matchesCondition(
        { operator: "PROPERTY_EQUALS", propertyId: "property-1" },
        event,
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        {
          operator: "TIME_WINDOW",
          from: "22:00",
          to: "06:00",
          timezone: "UTC",
        },
        event,
      ),
    ).toBe(true);
    expect(
      matchesRule(
        [
          { operator: "GREATER_THAN", field: "consumption", value: 10 },
          { operator: "MEDIUM_EQUALS", medium: "WATER" },
        ],
        event,
      ),
    ).toBe(true);
  });
  it("does not evaluate missing fields as zero", () => {
    expect(
      matchesCondition(
        { operator: "GREATER_THAN", field: "meterValue", value: 0 },
        event,
      ),
    ).toBe(false);
    expect(
      matchesCondition(
        { operator: "DURATION_AT_LEAST", field: "missingMinutes", minutes: 10 },
        event,
      ),
    ).toBe(false);
  });
  it("supports overnight windows and duration checks", () => {
    expect(
      matchesCondition(
        {
          operator: "TIME_WINDOW",
          from: "22:00",
          to: "06:00",
          timezone: "UTC",
        },
        { ...event, occurredAt: new Date("2026-01-01T05:30:00Z") },
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        { operator: "DURATION_AT_LEAST", field: "offlineMinutes", minutes: 15 },
        { ...event, offlineMinutes: 16 },
      ),
    ).toBe(true);
  });
  it("rejects executable or unknown rule fields", () => {
    const result = ruleDefinitionSchema.safeParse({
      name: "Unsafe",
      description: "No code",
      trigger: "READING_CREATED",
      conditions: [
        {
          operator: "EQUALS",
          field: "consumption",
          value: 1,
          expression: "process.env.SECRET",
        },
      ],
      actions: [{ type: "CREATE_ALARM", title: "Alert", severity: "LOW" }],
      expression: "globalThis.process",
    });
    expect(result.success).toBe(false);
  });
  it("validates supported actions and execution safeguards", () => {
    expect(
      actionSchema.parse({ type: "WEBHOOK", event: "alarm.created" }),
    ).toMatchObject({ type: "WEBHOOK" });
    expect(
      actionSchema.parse({
        type: "EMAIL",
        to: ["ops@example.test"],
        subject: "Alarm",
        body: "Text",
      }),
    ).toMatchObject({ type: "EMAIL" });
    expect(
      actionSchema.safeParse({
        type: "WEBHOOK",
        event: "alarm.created",
        code: "globalThis.process",
      }).success,
    ).toBe(false);
    const rule = ruleDefinitionSchema.parse({
      name: "Cooldown",
      description: "Schutz",
      trigger: "READING_CREATED",
      conditions: [],
      actions: [{ type: "CREATE_ALARM", title: "A", severity: "LOW" }],
      cooldownSeconds: 60,
      maxExecutionsPerHour: 2,
    });
    expect(rule.cooldownSeconds).toBe(60);
    expect(rule.maxExecutionsPerHour).toBe(2);
  });
});
