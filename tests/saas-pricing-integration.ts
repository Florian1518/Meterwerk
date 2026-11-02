import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { db } from "../src/server/db";
import {
  setBillingMetadata,
  tenantBilling,
  tenantSubscription,
} from "../src/server/licensing";
import { replaceMeterInTransaction } from "../src/server/meter-replacement";
import type { Actor } from "../src/server/policy";

/** Isolated fixtures; never changes demo meters or existing contracts. */
export async function testSaasPricing(admin: Actor) {
  await testPricingMigration();
  const tenantId = `pricing-${randomUUID()}`;
  const otherId = `${tenantId}-foreign`;
  const actor: Actor = { ...admin, role: "TENANT_ADMIN", tenantId };
  const metadata = {
    tenantId,
    billingInterval: "MONTHLY",
    priceAmount: "120.50",
    priceCurrency: "EUR",
    billingContactName: null,
    billingContactEmail: null,
    billingContactCompany: null,
    billingContactAddress: null,
    externalBillingId: `private-${tenantId}`,
  };
  try {
    const plan = await db.plan.findUniqueOrThrow({ where: { code: "BASIC" } });
    for (const id of [tenantId, otherId]) {
      await db.tenant.create({ data: { id, name: "Pricing test", slug: id } });
      await db.subscription.create({
        data: { tenantId: id, planId: plan.id, priceAmount: "120.50" },
      });
      await db.property.create({
        data: { id, tenantId: id, name: "Test", address: "Test", city: "Test" },
      });
      await db.building.create({
        data: { id, tenantId: id, propertyId: id, name: "Test" },
      });
      await db.unit.create({
        data: {
          id,
          tenantId: id,
          buildingId: id,
          name: "Test",
          floor: "0",
          area: "1",
        },
      });
    }
    const meter = (id: string, tenant = tenantId) => ({
      id: `${tenant}-${id}`,
      tenantId: tenant,
      unitId: tenant,
      serialNumber: id,
      type: "ELECTRICITY" as const,
      manufacturer: "Test",
      model: "Test",
      measurementUnit: "kWh",
      location: "Test",
      installedAt: new Date(),
      demoPricePerUnit: "0.30",
    });
    const fixed = await tenantBilling(actor);
    assert.equal(fixed.pricingMode, "FIXED");
    assert.equal(fixed.priceAmount, "120.5");
    assert.equal(fixed.effectivePriceAmount, "120.5");
    await setBillingMetadata(admin, { ...metadata, priceAmount: null });
    assert.equal((await tenantBilling(actor)).effectivePriceAmount, null);
    const automatic = {
      ...metadata,
      pricingMode: "BASE_PLUS_METER",
      basePriceAmount: "0.10",
      pricePerMeterAmount: "0.20",
    };
    await setBillingMetadata(admin, automatic);
    assert.equal((await tenantBilling(actor)).effectivePriceAmount, "0.10");
    await db.meter.createMany({
      data: [
        meter("active"),
        { ...meter("offline"), status: "OFFLINE" },
        { ...meter("maintenance"), status: "MAINTENANCE" },
        { ...meter("excluded"), billable: false },
        meter("foreign", otherId),
      ],
    });
    const calculated = await tenantBilling(actor);
    assert.equal(calculated.billableMeterCount, 3);
    assert.equal(calculated.effectivePriceAmount, "0.70");
    assert.equal(calculated.meterCostAmount, "0.60");
    assert.equal(calculated.priceAmount, "120.5");
    assert.ok(!("externalBillingId" in calculated));
    assert.ok(!JSON.stringify(calculated).includes(`private-${tenantId}`));
    assert.equal(
      (await tenantSubscription(admin, tenantId))?.effectivePriceAmount,
      "0.70",
    );
    await setBillingMetadata(admin, {
      ...automatic,
      billingInterval: "YEARLY",
    });
    assert.equal((await tenantBilling(actor)).effectivePriceAmount, "0.70");
    await assert.rejects(() => tenantBilling(actor, otherId), { status: 403 });
    await assert.rejects(() => tenantBilling(admin), { status: 400 });
    await assert.rejects(() => tenantSubscription(admin, ""), { status: 400 });
    for (const role of ["USER", "MANAGER"] as const)
      await assert.rejects(() => tenantBilling({ ...actor, role }), {
        status: 403,
      });
    await assert.rejects(() => setBillingMetadata(actor, automatic), {
      status: 403,
    });
    await assert.rejects(
      () => setBillingMetadata(actor, { ...automatic, tenantId: otherId }),
      { status: 403 },
    );
    for (const patch of [
      { basePriceAmount: "-1" },
      { pricePerMeterAmount: "-0.01" },
      { pricePerMeterAmount: "1.001" },
      { basePriceAmount: null },
      { pricePerMeterAmount: undefined },
      { priceCurrency: "EURO" },
      { priceAmount: "-1" },
      { basePriceAmount: "10000000000" },
    ])
      await assert.rejects(() =>
        setBillingMetadata(admin, { ...automatic, ...patch }),
      );
    const replacement = {
      oldMeterId: `${tenantId}-active`,
      newMeterId: `${tenantId}-excluded`,
      removedAt: new Date().toISOString(),
      installedAt: new Date().toISOString(),
      removedRegister: "10",
      installedRegister: "0",
      reason: "Test",
    };
    await assert.rejects(
      () =>
        db.$transaction((tx) =>
          replaceMeterInTransaction(tx, actor, tenantId, {
            ...replacement,
            newMeterId: `${otherId}-foreign`,
          }),
        ),
      { status: 404 },
    );
    await assert.rejects(
      () =>
        db.$transaction((tx) =>
          replaceMeterInTransaction(
            tx,
            { ...actor, role: "USER" },
            tenantId,
            replacement,
          ),
        ),
      { status: 404 },
    );
    await assert.rejects(
      () =>
        db.$transaction(async (tx) => {
          await replaceMeterInTransaction(tx, actor, tenantId, replacement);
          throw new Error("rollback-test");
        }),
      /rollback-test/,
    );
    assert.equal(
      (
        await db.meter.findUniqueOrThrow({
          where: { id: replacement.oldMeterId },
        })
      ).billable,
      true,
    );
    assert.equal(
      (
        await db.meter.findUniqueOrThrow({
          where: { id: replacement.newMeterId },
        })
      ).billable,
      false,
    );
    await db.$transaction((tx) =>
      replaceMeterInTransaction(tx, actor, tenantId, replacement),
    );
    assert.equal(
      (
        await db.meter.findUniqueOrThrow({
          where: { id: replacement.oldMeterId },
        })
      ).billable,
      false,
    );
    assert.equal(
      (
        await db.meter.findUniqueOrThrow({
          where: { id: replacement.newMeterId },
        })
      ).billable,
      true,
    );
    assert.equal((await tenantBilling(actor)).billableMeterCount, 3);
    const events = await db.auditEvent.findMany({ where: { tenantId } });
    assert.equal(
      events.filter((e) => e.action === "subscription.billing_metadata_changed")
        .length,
      3,
    );
    assert.equal(
      events.filter((e) => e.action === "meter.replacement").length,
      1,
    );
    await setBillingMetadata(admin, { ...metadata, pricingMode: "FIXED" });
    assert.equal((await tenantBilling(actor)).effectivePriceAmount, "120.5");
    console.log(
      "PASS isolated SaaS pricing, roles, tenant isolation, replacement rollback and audit",
    );
  } finally {
    const where = { tenantId: { in: [tenantId, otherId] } };
    await db.meterReplacement.deleteMany({ where });
    await db.meter.deleteMany({ where });
    await db.unit.deleteMany({ where });
    await db.building.deleteMany({ where });
    await db.property.deleteMany({ where });
    await db.subscription.deleteMany({ where });
    await db.auditEvent.deleteMany({ where });
    await db.tenant.deleteMany({ where: { id: { in: [tenantId, otherId] } } });
  }
}

async function testPricingMigration() {
  const schema = `pricing_migration_${randomUUID().replaceAll("-", "")}`;
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/202610260001_saas_pricing/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  // Transaction-local schema models pre-migration rows; always rolled back.
  await assert.rejects(
    () =>
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe(
          'CREATE TABLE "Subscription" ("id" TEXT, "priceAmount" DECIMAL(12,2))',
        );
        await tx.$executeRawUnsafe(
          'CREATE TABLE "Meter" ("id" TEXT, "tenantId" TEXT)',
        );
        await tx.$executeRawUnsafe(
          'CREATE TABLE "MeterReplacement" ("oldMeterId" TEXT, "newMeterId" TEXT, "tenantId" TEXT)',
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "Subscription" VALUES ('fixed', 120.50), ('unset', NULL)`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "Meter" VALUES ('old', 'a'), ('middle', 'a'), ('new', 'a'), ('other', 'b')`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "MeterReplacement" VALUES ('old', 'middle', 'a'), ('middle', 'new', 'a'), ('other', 'new', 'a')`,
        );
        for (const statement of migration
          .split(";")
          .filter((sql) => sql.trim()))
          await tx.$executeRawUnsafe(statement);
        const rows = await tx.$queryRawUnsafe<
          { id: string; billable: boolean }[]
        >('SELECT * FROM "Meter" ORDER BY "id"');
        assert.deepEqual(
          rows.map((row) => [row.id, row.billable]),
          [
            ["middle", false],
            ["new", true],
            ["old", false],
            ["other", true],
          ],
        );
        const subscriptions = await tx.$queryRawUnsafe<
          { pricingMode: string; amount: string | null }[]
        >(
          'SELECT "pricingMode", "priceAmount"::text AS amount FROM "Subscription" ORDER BY "id"',
        );
        assert.deepEqual(subscriptions, [
          { pricingMode: "FIXED", amount: "120.50" },
          { pricingMode: "FIXED", amount: null },
        ]);
        throw new Error("migration-test-rollback");
      }),
    { message: "migration-test-rollback" },
  );
  console.log(
    "PASS additive migration preserves fixed prices and backfills replacement chains",
  );
}
