import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { writeResource } from "../src/server/crud";
import { listResource } from "../src/server/data";
import {
  changePlan,
  setPlanOverride,
  setFeatureOverride,
  tenantUsage,
  requireTenantQuota,
  recordTenantUsage,
  usageLevel,
  unlimited,
} from "../src/server/licensing";
import type { Actor } from "../src/server/policy";

if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Lokale Demo-Datenbank erforderlich.");
const tenantId = `usage-${randomUUID()}`;
const otherId = `usage-${randomUUID()}`;
const platform: Actor = {
  id: "usage-test-admin",
  tenantId: null,
  role: "SUPER_ADMIN",
  name: "Test",
  email: "usage@example.invalid",
};
const actor: Actor = { ...platform, tenantId, role: "TENANT_ADMIN" };
let checks = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}
async function createProperty() {
  return writeResource(actor, "properties", "create", {
    name: "Test",
    address: "Teststraße 1",
    city: "Berlin",
  });
}
try {
  await db.tenant.createMany({
    data: [
      { id: tenantId, name: "Usage test", slug: tenantId },
      { id: otherId, name: "Other usage test", slug: otherId },
    ],
  });
  await changePlan(platform, { tenantId, plan: "ENTERPRISE" });
  await changePlan(platform, { tenantId: otherId, plan: "BASIC" });
  await check(
    "usage is tenant isolated and restricted to administrators",
    async () => {
      await db.property.create({
        data: {
          tenantId: otherId,
          name: "Foreign",
          address: "Other",
          city: "Other",
        },
      });
      assert.equal(
        (await tenantUsage(actor)).resources.find((r) => r.key === "properties")
          ?.count,
        0,
      );
      await assert.rejects(() => tenantUsage(actor, otherId), { status: 403 });
      await assert.rejects(() => tenantUsage({ ...actor, role: "USER" }), {
        status: 403,
      });
      await assert.rejects(() => tenantUsage({ ...actor, role: "MANAGER" }), {
        status: 403,
      });
      await assert.rejects(() => tenantUsage(platform), { status: 400 });
    },
  );
  await check(
    "concurrent creation cannot exceed quota; rejection leaves no audit or partial data",
    async () => {
      await setPlanOverride(platform, { tenantId, maxProperties: 1 });
      const results = await Promise.allSettled([
        createProperty(),
        createProperty(),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const rejected = results.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      assert.equal(rejected.reason.status, 409);
      assert.match(rejected.reason.message, /Liegenschaften/);
      assert.equal(await db.property.count({ where: { tenantId } }), 1);
      const beforeAudit = await db.auditEvent.count({ where: { tenantId } });
      await assert.rejects(createProperty, { status: 409 });
      assert.equal(
        await db.auditEvent.count({ where: { tenantId } }),
        beforeAudit,
      );
    },
  );
  await check("all resource limits reject new creation", async () => {
    const property = await db.property.findFirstOrThrow({
      where: { tenantId },
    });
    await setPlanOverride(platform, {
      tenantId,
      maxBuildings: 0,
      maxUnits: 0,
      maxMeters: 0,
      maxDevices: 0,
      maxGateways: 0,
      maxUsers: 0,
    });
    await assert.rejects(
      () =>
        writeResource(actor, "buildings", "create", {
          name: "Building",
          propertyId: property.id,
        }),
      { status: 409 },
    );
    await assert.rejects(
      () =>
        writeResource(actor, "units", "create", {
          name: "Unit",
          buildingId: "foreign",
          floor: "1",
          area: 1,
        }),
      { status: 409 },
    );
    await assert.rejects(() => writeResource(actor, "meters", "create", {}), {
      status: 409,
    });
    await assert.rejects(
      () =>
        writeResource(actor, "users", "create", {
          name: "Test",
          email: "new@example.invalid",
          role: "USER",
          password: "test-only-password-1234",
        }),
      { status: 409 },
    );
    for (const quota of ["devices", "gateways"] as const) {
      await assert.rejects(
        () =>
          db.$transaction(async (tx) => {
            await requireTenantQuota(tx, tenantId, quota);
            throw new Error("Quota did not reject");
          }),
        { status: 409 },
      );
    }
    const usage = await tenantUsage(actor);
    assert.equal(usage.resources.length, 7);
    assert.ok(
      usage.resources
        .filter((r) => r.key !== "properties")
        .every((r) => r.count === 0 && r.limit === 0),
    );
    await setPlanOverride(platform, { tenantId, maxBuildings: null });
    await assert.rejects(
      () =>
        writeResource(actor, "buildings", "create", {
          name: "Foreign parent",
          propertyId: "foreign",
        }),
      { status: 404 },
    );
    assert.equal(await db.building.count({ where: { tenantId } }), 0);
  });
  await check(
    "failed compound creation rolls back resource and audit",
    async () => {
      await setPlanOverride(platform, { tenantId, maxProperties: 2 });
      await assert.rejects(
        () =>
          db.$transaction(async (tx) => {
            await requireTenantQuota(tx, tenantId, "properties");
            await tx.property.create({
              data: {
                tenantId,
                name: "Rollback",
                address: "Test",
                city: "Test",
              },
            });
            await tx.auditEvent.create({
              data: {
                tenantId,
                actorId: actor.id,
                action: "usage.rollback",
                entityId: tenantId,
              },
            });
            throw new Error("Rollback");
          }),
        /Rollback/,
      );
      assert.equal(await db.property.count({ where: { tenantId } }), 1);
      assert.equal(
        await db.auditEvent.count({
          where: { tenantId, action: "usage.rollback" },
        }),
        0,
      );
    },
  );
  await check(
    "downgrade preserves readable stock and blocks creation above limit",
    async () => {
      await setPlanOverride(platform, { tenantId, maxProperties: 10 });
      for (let i = 0; i < 5; i++) await createProperty();
      await changePlan(platform, { tenantId, plan: "BASIC" });
      const row = (await tenantUsage(actor)).resources.find(
        (r) => r.key === "properties",
      )!;
      assert.equal(row.count, 6);
      assert.equal(row.limit, 5);
      assert.equal(row.warning, 100);
      await listResource(actor, "properties");
      assert.equal(await db.property.count({ where: { tenantId } }), 6);
      await assert.rejects(createProperty, { status: 409 });
      const property = await db.property.findFirstOrThrow({
        where: { tenantId },
      });
      await writeResource(actor, "properties", "update", {
        id: property.id,
        name: "Still editable",
        address: property.address,
        city: property.city,
      });
    },
  );
  await check(
    "monthly API and export counters increment atomically and remain tenant scoped",
    async () => {
      await Promise.all(
        Array.from({ length: 5 }, () => recordTenantUsage(tenantId, "API")),
      );
      await recordTenantUsage(tenantId, "EXPORT");
      const usage = await tenantUsage(actor);
      assert.equal(usage.apiRequests, 5);
      assert.equal(usage.exports, 1);
      assert.equal(usage.reports, 0);
      assert.equal((await tenantUsage(platform, otherId)).apiRequests, 0);
    },
  );
  await check(
    "plan, feature override and limit changes are audited",
    async () => {
      await changePlan(platform, { tenantId, plan: "ENTERPRISE" });
      await setFeatureOverride(platform, {
        tenantId,
        feature: "API",
        enabled: false,
      });
      const events = await db.auditEvent.findMany({ where: { tenantId } });
      for (const action of [
        "subscription.plan_changed",
        "subscription.feature_override",
        "subscription.limits_changed",
      ])
        assert.ok(events.some((e) => e.action === action));
      const before = events.length;
      await assert.rejects(
        () => setPlanOverride(actor, { tenantId, maxProperties: 100 }),
        { status: 403 },
      );
      assert.equal(await db.auditEvent.count({ where: { tenantId } }), before);
    },
  );
  await check(
    "warning thresholds are exact and unlimited is explicit",
    async () => {
      for (const [count, warning] of [
        [79, null],
        [80, 80],
        [89, 80],
        [90, 90],
        [99, 90],
        [100, 100],
        [120, 100],
      ] as const)
        assert.equal(usageLevel(count, 100).warning, warning);
      assert.equal(usageLevel(500, unlimited).percent, null);
      assert.equal(usageLevel(1, 0).warning, 100);
    },
  );
  await check(
    "all seven counters include existing inactive resources and reports",
    async () => {
      const property = await db.property.findFirstOrThrow({
        where: { tenantId: otherId },
      });
      const building = await db.building.create({
        data: {
          tenantId: otherId,
          propertyId: property.id,
          name: "Test building",
        },
      });
      const unit = await db.unit.create({
        data: {
          tenantId: otherId,
          buildingId: building.id,
          name: "Test unit",
          floor: "1",
          area: "50",
        },
      });
      const meter = await db.meter.create({
        data: {
          tenantId: otherId,
          unitId: unit.id,
          serialNumber: "usage-meter",
          type: "WATER",
          manufacturer: "Test",
          model: "Virtual",
          measurementUnit: "m³",
          location: "Test",
          status: "MAINTENANCE",
          installedAt: new Date(),
          demoPricePerUnit: "0",
        },
      });
      const gateway = await db.gateway.create({
        data: {
          tenantId: otherId,
          name: "Test",
          externalGatewayId: "usage-gateway",
          manufacturer: "Test",
          model: "Virtual",
          status: "DISABLED",
          installedAt: new Date(),
        },
      });
      await db.device.create({
        data: {
          tenantId: otherId,
          meterId: meter.id,
          gatewayId: gateway.id,
          externalDeviceId: "usage-device",
          manufacturer: "Test",
          model: "Virtual",
          protocol: "VIRTUAL",
          status: "DISABLED",
          installedAt: new Date(),
        },
      });
      const user = await db.user.create({
        data: {
          tenantId: otherId,
          name: "Test",
          email: `${otherId}@example.invalid`,
          passwordHash: "disabled-test-account",
          role: "USER",
          active: false,
        },
      });
      await db.report.create({
        data: {
          tenantId: otherId,
          createdById: user.id,
          type: "MONTHLY",
          title: "Test",
          periodFrom: new Date(),
          periodTo: new Date(),
        },
      });
      const usage = await tenantUsage(platform, otherId);
      assert.ok(usage.resources.every((r) => r.count === 1));
      assert.equal(usage.reports, 1);
      assert.equal((await tenantUsage(actor)).reports, 0);
    },
  );
  console.log(`${checks} usage checks passed.`);
} finally {
  for (const id of [tenantId, otherId]) {
    await db.auditEvent.deleteMany({ where: { tenantId: id } });
    await db.report.deleteMany({ where: { tenantId: id } });
    await db.user.deleteMany({ where: { tenantId: id } });
    await db.device.deleteMany({ where: { tenantId: id } });
    await db.gateway.deleteMany({ where: { tenantId: id } });
    await db.meter.deleteMany({ where: { tenantId: id } });
    await db.unit.deleteMany({ where: { tenantId: id } });
    await db.building.deleteMany({ where: { tenantId: id } });
    await db.property.deleteMany({ where: { tenantId: id } });
    await db.tenant.deleteMany({ where: { id } });
  }
  await db.$disconnect();
}
