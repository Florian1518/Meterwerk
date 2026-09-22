import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { changePlan } from "../src/server/licensing";
import { AccessError, type Actor } from "../src/server/policy";
import {
  correctReading,
  readingCorrectionHistory,
  scanDataQuality,
} from "../src/server/data-quality";

if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Lokale Demo-Datenbank erforderlich.");
const tenantId = `quality-${randomUUID()}`;
const foreignTenantId = `quality-foreign-${randomUUID()}`;
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
  name: "Quality Admin",
  email: "quality@example.invalid",
};
const checks: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  await run();
  checks.push(name);
  console.log(`PASS ${name}`);
}
let readingIds: string[] = [];
let foreignReadingId = "";
try {
  await db.tenant.createMany({
    data: [
      { id: tenantId, name: "Quality", slug: tenantId },
      { id: foreignTenantId, name: "Quality Foreign", slug: foreignTenantId },
    ],
  });
  await changePlan(platform, { tenantId, plan: "PROFESSIONAL" });
  await changePlan(platform, {
    tenantId: foreignTenantId,
    plan: "PROFESSIONAL",
  });
  async function makeMeter(forTenant: string, serial: string) {
    const property = await db.property.create({
      data: {
        tenantId: forTenant,
        name: serial,
        address: "Teststraße 1",
        city: "Berlin",
      },
    });
    const building = await db.building.create({
      data: { tenantId: forTenant, propertyId: property.id, name: "Haus" },
    });
    const unit = await db.unit.create({
      data: {
        tenantId: forTenant,
        buildingId: building.id,
        name: "EG",
        floor: "EG",
        area: "45.00",
      },
    });
    return db.meter.create({
      data: {
        tenantId: forTenant,
        unitId: unit.id,
        serialNumber: serial,
        type: "WATER",
        manufacturer: "Test",
        model: "M1",
        measurementUnit: "m³",
        location: "EG",
        installedAt: new Date("2024-01-01T00:00:00Z"),
        demoPricePerUnit: "0.25",
      },
    });
  }
  const meter = await makeMeter(tenantId, `${tenantId}-meter`);
  const foreignMeter = await makeMeter(
    foreignTenantId,
    `${foreignTenantId}-meter`,
  );
  const rows = await Promise.all([
    db.reading.create({
      data: {
        tenantId,
        meterId: meter.id,
        timestamp: new Date("2026-01-01T00:00:00Z"),
        registerValue: "100",
        consumption: "2",
        measurementUnit: "m³",
        source: "MANUAL",
      },
    }),
    db.reading.create({
      data: {
        tenantId,
        meterId: meter.id,
        timestamp: new Date("2026-01-01T00:00:00Z"),
        registerValue: "101",
        consumption: "1",
        measurementUnit: "m³",
        source: "DEMO",
      },
    }),
    db.reading.create({
      data: {
        tenantId,
        meterId: meter.id,
        timestamp: new Date("2026-02-01T00:00:00Z"),
        registerValue: "99",
        consumption: "1",
        measurementUnit: "m³",
        source: "MANUAL",
      },
    }),
    db.reading.create({
      data: {
        tenantId: foreignTenantId,
        meterId: foreignMeter.id,
        timestamp: new Date("2026-01-01T00:00:00Z"),
        registerValue: "5",
        consumption: "1",
        measurementUnit: "m³",
        source: "MANUAL",
      },
    }),
  ]);
  readingIds = rows.slice(0, 3).map((row) => row.id);
  foreignReadingId = rows[3]!.id;

  await check(
    "quality scan detects duplicate, rollback and data gap, isolated by tenant",
    async () => {
      const result = await scanDataQuality(actor, null, {
        from: "2026-01-01",
        to: "2026-02-28",
        meter: meter.id,
      });
      assert.equal(result.scannedMeters, 1);
      const findings = await db.dataQualityFinding.findMany({
        where: { tenantId, meterId: meter.id, resolvedAt: null },
      });
      assert.ok(
        findings.some((finding) => finding.type === "DUPLICATE_READINGS"),
      );
      assert.ok(
        findings.some((finding) => finding.type === "COUNTER_ROLLBACK"),
      );
      assert.ok(findings.some((finding) => finding.type === "DATA_GAP"));
      assert.equal(
        await db.dataQualityFinding.count({ where: { tenantId } }),
        findings.length,
      );
      await assert.rejects(() =>
        db.reading.create({
          data: {
            tenantId,
            meterId: meter.id,
            timestamp: new Date("2026-03-01T00:00:00Z"),
            registerValue: "102",
            consumption: "-1",
            measurementUnit: "m³",
            source: "MANUAL",
          },
        }),
      );
      await assert.rejects(() =>
        db.reading.create({
          data: {
            tenantId,
            meterId: meter.id,
            timestamp: new Date("2026-03-02T00:00:00Z"),
            registerValue: "102",
            consumption: "1",
            measurementUnit: "kWh",
            source: "MANUAL",
          },
        }),
      );
    },
  );
  await check(
    "correction is reasoned and preserves immutable before/after history",
    async () => {
      await assert.rejects(() =>
        correctReading(actor, readingIds[0]!, null, {
          action: "MARK_INVALID",
          reason: "wrong",
        }),
      );
      const corrected = await correctReading(actor, readingIds[0]!, null, {
        action: "MARK_INVALID",
        reason: "Negativer Wasserverbrauch fachlich ungültig",
      });
      assert.equal(
        (await db.reading.findUniqueOrThrow({ where: { id: readingIds[0] } }))
          .quality,
        "INVALID",
      );
      const history = await readingCorrectionHistory(
        actor,
        readingIds[0]!,
        null,
      );
      assert.equal(history.length, 1);
      assert.equal(
        (history[0]!.beforeData as { quality: string }).quality,
        "VALID",
      );
      assert.equal(
        (history[0]!.afterData as { quality: string }).quality,
        "INVALID",
      );
      assert.equal(
        corrected.reason,
        "Negativer Wasserverbrauch fachlich ungültig",
      );
    },
  );
  await check(
    "invalid correction values and cross-tenant readings are rejected",
    async () => {
      await assert.rejects(() =>
        correctReading(actor, readingIds[1]!, null, {
          action: "CORRECT",
          reason: "Einheit darf nicht verändert werden",
          measurementUnit: "kWh",
        }),
      );
      await assert.rejects(
        () =>
          correctReading(actor, foreignReadingId, foreignTenantId, {
            action: "MARK_INVALID",
            reason: "Fremden Messwert sperren",
          }),
        (error: unknown) =>
          error instanceof AccessError && error.status === 403,
      );
      await assert.rejects(
        () => readingCorrectionHistory(actor, foreignReadingId, null),
        (error: unknown) =>
          error instanceof AccessError && error.status === 404,
      );
      await assert.rejects(() =>
        correctReading(actor, readingIds[1]!, null, {
          action: "CORRECT",
          reason: "Negative Zahlenwert fachlich setzen",
          consumption: "-100",
        }),
      );
      assert.equal(
        await db.dataQualityCorrection.count({ where: { tenantId } }),
        1,
      );
    },
  );
  console.log(`${checks.length} Data quality integration checks passed.`);
} finally {
  await db.dataQualityCorrection.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.dataQualityFinding.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.auditEvent.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.reading.deleteMany({
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
