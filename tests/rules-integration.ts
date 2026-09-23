import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { changePlan } from "../src/server/licensing";
import { AccessError, type Actor } from "../src/server/policy";
import {
  createRule,
  listRules,
  processRuleEvent,
  runScheduledRules,
  ruleExecutions,
} from "../src/server/rules";

if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Lokale Demo-Datenbank erforderlich.");
const tenantId = `rules-${randomUUID()}`;
const foreignTenantId = `rules-foreign-${randomUUID()}`;
const platform: Actor = {
  id: "platform-admin",
  tenantId: null,
  role: "SUPER_ADMIN",
  name: "Platform",
  email: "platform@example.invalid",
};
const actor: Actor = {
  id: `${tenantId}-admin`,
  tenantId,
  role: "TENANT_ADMIN",
  name: "Rules Admin",
  email: "rules@example.invalid",
};
const foreignActor: Actor = {
  ...actor,
  id: `${foreignTenantId}-admin`,
  tenantId: foreignTenantId,
};
try {
  await db.tenant.createMany({
    data: [
      { id: tenantId, name: "Rules", slug: tenantId },
      { id: foreignTenantId, name: "Rules foreign", slug: foreignTenantId },
    ],
  });
  await changePlan(platform, { tenantId, plan: "PROFESSIONAL" });
  await changePlan(platform, {
    tenantId: foreignTenantId,
    plan: "PROFESSIONAL",
  });
  const property = await db.property.create({
    data: {
      tenantId,
      name: "Rule property",
      address: "Rule 1",
      city: "Berlin",
    },
  });
  const building = await db.building.create({
    data: { tenantId, propertyId: property.id, name: "Haus" },
  });
  const unit = await db.unit.create({
    data: {
      tenantId,
      buildingId: building.id,
      name: "EG",
      floor: "EG",
      area: "20",
    },
  });
  const meter = await db.meter.create({
    data: {
      tenantId,
      unitId: unit.id,
      serialNumber: `${tenantId}-meter`,
      type: "WATER",
      manufacturer: "Test",
      model: "R1",
      measurementUnit: "m³",
      location: "EG",
      installedAt: new Date("2025-01-01T00:00:00Z"),
      demoPricePerUnit: "0.2",
    },
  });
  const foreignProperty = await db.property.create({
    data: {
      tenantId: foreignTenantId,
      name: "Foreign",
      address: "Foreign 1",
      city: "Berlin",
    },
  });
  await assert.rejects(
    () =>
      createRule(actor, foreignTenantId, {
        name: "x",
        description: "x",
        trigger: "READING_CREATED",
        conditions: [],
        actions: [{ type: "CREATE_ALARM", title: "x", severity: "LOW" }],
      }),
    (e: unknown) => e instanceof AccessError && e.status === 403,
  );
  await assert.rejects(
    () =>
      createRule({ ...actor, role: "USER" }, null, {
        name: "x",
        description: "x",
        trigger: "READING_CREATED",
        conditions: [],
        actions: [{ type: "CREATE_ALARM", title: "x", severity: "LOW" }],
      }),
    (e: unknown) => e instanceof AccessError && e.status === 403,
  );
  await assert.rejects(
    () =>
      createRule(actor, null, {
        name: "cross",
        description: "cross",
        propertyId: foreignProperty.id,
        trigger: "READING_CREATED",
        conditions: [],
        actions: [{ type: "CREATE_ALARM", title: "x", severity: "LOW" }],
      }),
    (e: unknown) => e instanceof AccessError && e.status === 404,
  );
  const rule = await createRule(actor, null, {
    name: "Night water",
    description: "Water threshold",
    propertyId: property.id,
    meterId: meter.id,
    medium: "WATER",
    trigger: "READING_CREATED",
    conditions: [
      { operator: "GREATER_THAN", field: "consumption", value: "10" },
      { operator: "TIME_WINDOW", from: "22:00", to: "06:00", timezone: "UTC" },
    ],
    actions: [{ type: "CREATE_ALARM", title: "Night water", severity: "HIGH" }],
    priority: 10,
  });
  assert.equal((await listRules(actor, null)).length, 1);
  const event = {
    trigger: "READING_CREATED" as const,
    eventKey: `reading:${randomUUID()}`,
    occurredAt: new Date("2026-01-01T23:30:00Z"),
    meter: {
      id: meter.id,
      propertyId: property.id,
      type: "WATER",
      status: "ACTIVE",
      lastContact: null,
      installedAt: meter.installedAt,
    },
    reading: {
      consumption: "12",
      registerValue: "100",
      meterValue: null,
      timestamp: new Date("2026-01-01T23:30:00Z"),
    },
  };
  const first = await processRuleEvent(actor, null, event);
  assert.equal(first[0]?.matched, true);
  assert.equal(first[0]?.actionCount, 1);
  assert.equal(
    await db.alarm.count({ where: { tenantId, title: "Night water" } }),
    1,
  );
  const replay = await processRuleEvent(actor, null, event);
  assert.deepEqual(replay, first);
  assert.equal(
    await db.alarm.count({ where: { tenantId, title: "Night water" } }),
    1,
  );
  const foreignEvent = {
    ...event,
    eventKey: `foreign:${randomUUID()}`,
    meter: { ...event.meter, id: meter.id },
  };
  await assert.rejects(
    () => processRuleEvent(foreignActor, foreignTenantId, foreignEvent),
    (e: unknown) => e instanceof AccessError && e.status === 404,
  );
  const scheduled = await createRule(actor, null, {
    name: "Missing water",
    description: "No reading",
    meterId: meter.id,
    trigger: "SCHEDULED_CHECK",
    conditions: [
      { operator: "DURATION_AT_LEAST", field: "missingMinutes", minutes: 10 },
    ],
    actions: [{ type: "CREATE_ALARM", title: "Missing", severity: "MEDIUM" }],
  });
  const schedule = await runScheduledRules(
    actor,
    null,
    new Date("2026-01-01T12:00:00Z"),
  );
  assert.equal(schedule.checkedRules, 1);
  assert.ok(schedule.results.some((item) => item.meterId === meter.id));
  assert.ok((await ruleExecutions(actor, null, rule.id)).length >= 1);
  assert.ok((await ruleExecutions(actor, null, scheduled.id)).length >= 1);
  await assert.rejects(
    () =>
      createRule(platform, null, {
        name: "missing tenant",
        description: "x",
        trigger: "READING_CREATED",
        conditions: [],
        actions: [{ type: "CREATE_ALARM", title: "x", severity: "LOW" }],
      }),
    (e: unknown) => e instanceof AccessError && e.status === 400,
  );
  console.log("7 rules integration checks passed.");
} finally {
  await db.ruleExecution.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.rule.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.alarm.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.meter.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.unit.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.building.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.property.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.tenant.deleteMany({
    where: { id: { in: [tenantId, foreignTenantId] } },
  });
  await db.$disconnect();
}
