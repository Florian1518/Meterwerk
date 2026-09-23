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
  bulkDataQuality,
  getDataQuality,
} from "../src/server/data-quality";
import { exportReadings } from "../src/server/data-export";
import { parseCsv } from "../src/lib/csv-import";

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
  await check(
    "bulk actions reject mixed tenants and privilege escalation atomically",
    async () => {
      const payload = {
        action: "SET_STATUS",
        ids: readingIds,
        status: "SUSPECT",
        reason: "Sammelprüfung durch Verwaltung",
      };
      const before = await db.reading.findMany({
        where: { tenantId },
        select: { id: true, quality: true },
        orderBy: { id: "asc" },
      });
      const correctionsBefore = await db.dataQualityCorrection.count({
        where: { tenantId },
      });
      for (const role of ["USER", "MANAGER"] as const)
        await assert.rejects(() =>
          bulkDataQuality({ ...actor, role }, null, payload),
        );
      await assert.rejects(() => bulkDataQuality(platform, null, payload));
      await assert.rejects(() =>
        bulkDataQuality(actor, foreignTenantId, payload),
      );
      await assert.rejects(() =>
        bulkDataQuality(actor, null, {
          ...payload,
          ids: [readingIds[0], foreignReadingId],
        }),
      );
      await assert.rejects(() =>
        bulkDataQuality(actor, null, {
          ...payload,
          ids: [readingIds[0], "missing"],
        }),
      );
      await assert.rejects(() =>
        bulkDataQuality(actor, null, { ...payload, status: "SUPER_ADMIN" }),
      );
      await assert.rejects(() =>
        bulkDataQuality(actor, null, {
          ...payload,
          ids: Array(101).fill(readingIds[0]),
        }),
      );
      assert.deepEqual(
        await db.reading.findMany({
          where: { tenantId },
          select: { id: true, quality: true },
          orderBy: { id: "asc" },
        }),
        before,
      );
      assert.equal(
        await db.dataQualityCorrection.count({ where: { tenantId } }),
        correctionsBefore,
      );
      assert.equal(
        (await bulkDataQuality(actor, null, payload)).affected,
        readingIds.length,
      );
      assert.equal(
        await db.dataQualityCorrection.count({ where: { tenantId } }),
        correctionsBefore + readingIds.length,
      );
      assert.equal(
        await db.auditEvent.count({
          where: { tenantId, action: "data_quality.bulk_set_status" },
        }),
        1,
      );
      const findings = await db.dataQualityFinding.findMany({
        where: { tenantId, resolvedAt: null },
        take: 2,
      });
      assert.equal(findings.length, 2);
      const ack = {
        action: "ACKNOWLEDGE",
        ids: findings.map((row) => row.id),
        reason: "Befunde gemeinsam fachlich gesichtet",
      };
      await assert.rejects(() =>
        bulkDataQuality(actor, null, {
          ...ack,
          ids: [ack.ids[0], "foreign-finding"],
        }),
      );
      await bulkDataQuality(actor, null, ack);
      assert.equal(
        await db.dataQualityFinding.count({
          where: {
            tenantId,
            id: { in: ack.ids },
            acknowledgedBy: actor.id,
            resolvedAt: null,
          },
        }),
        2,
      );
      await assert.rejects(() => bulkDataQuality(actor, null, ack));
    },
  );
  await check(
    "finding pagination remains scoped and foreign acknowledgements are atomic",
    async () => {
      const window = {
        windowFrom: new Date("2026-01-01T00:00:00Z"),
        windowTo: new Date("2026-03-01T00:00:00Z"),
      };
      await db.dataQualityFinding.createMany({
        data: Array.from({ length: 52 }, (_, index) => ({
          tenantId,
          meterId: meter.id,
          type: "UNUSUAL_JUMP" as const,
          status: "WARNING" as const,
          fingerprint: `paged-${index}`,
          description: "Pagination fixture",
          ...window,
        })),
      });
      const foreignFinding = await db.dataQualityFinding.create({
        data: {
          tenantId: foreignTenantId,
          meterId: foreignMeter.id,
          type: "UNUSUAL_JUMP",
          status: "WARNING",
          fingerprint: "foreign-finding",
          description: "Foreign fixture",
          ...window,
        },
      });
      const filter = { from: "2026-01-01", to: "2026-02-28" };
      const first = await getDataQuality(actor, null, filter);
      assert.equal(first.findings.length, 50);
      assert.ok(first.nextCursor);
      const second = await getDataQuality(actor, null, {
        ...filter,
        cursor: first.nextCursor,
      });
      assert.ok(second.findings.length > 0);
      assert.ok(
        second.findings.every(
          (entry) => !first.findings.some((item) => item.id === entry.id),
        ),
      );
      assert.ok(
        [...first.findings, ...second.findings].every(
          (entry) => entry.id !== foreignFinding.id,
        ),
      );
      for (const role of ["USER", "MANAGER"] as const)
        await assert.rejects(() =>
          getDataQuality({ ...actor, role }, null, filter),
        );
      await assert.rejects(() =>
        getDataQuality(actor, foreignTenantId, filter),
      );
      await assert.rejects(() => getDataQuality(platform, null, filter));
      const own = first.findings.find((entry) => !entry.acknowledgedAt)!;
      await assert.rejects(() =>
        bulkDataQuality(actor, null, {
          action: "ACKNOWLEDGE",
          ids: [own.id, foreignFinding.id],
          reason: "Fremden Befund nicht mitbestätigen",
        }),
      );
      assert.equal(
        (
          await db.dataQualityFinding.findUniqueOrThrow({
            where: { id: own.id },
          })
        ).acknowledgedAt,
        null,
      );
    },
  );
  await check(
    "streaming export applies every filter and USER property grants",
    async () => {
      const filter = {
        from: "2026-01-01T00:00:00Z",
        to: "2026-03-01T00:00:00Z",
      };
      const csv = async (who: Actor, options: unknown = filter) =>
        parseCsv(
          await new Response(await exportReadings(who, null, options)).text(),
        );
      const own = await csv(actor);
      assert.equal(own.rows.length, readingIds.length);
      assert.ok(own.rows.every((row) => !row.includes(foreignReadingId)));
      const property = await db.property.findFirstOrThrow({
        where: { tenantId },
      });
      assert.equal(
        (
          await csv(actor, {
            ...filter,
            propertyId: property.id,
            meterId: meter.id,
            medium: "WATER",
          })
        ).rows.length,
        readingIds.length,
      );
      assert.equal(
        (await csv(actor, { ...filter, medium: "GAS" })).rows.length,
        0,
      );
      assert.equal(
        (await csv(actor, { ...filter, to: "2026-02-01T00:00:00Z" })).rows
          .length,
        2,
      );
      await assert.rejects(() =>
        exportReadings(actor, foreignTenantId, filter),
      );
      await assert.rejects(() =>
        csv(actor, { ...filter, meterId: foreignMeter.id }),
      );
      await assert.rejects(() =>
        csv(actor, { ...filter, propertyId: "foreign-property" }),
      );
      await assert.rejects(() => exportReadings(platform, null, filter));
      const user = await db.user.create({
        data: {
          tenantId,
          name: "Export User",
          email: `${tenantId}@example.invalid`,
          passwordHash: "disabled-test-account",
          role: "USER",
          active: false,
        },
      });
      const reader: Actor = { ...actor, id: user.id, role: "USER" };
      assert.equal((await csv(reader)).rows.length, 0);
      await assert.rejects(() => csv(reader, { ...filter, meterId: meter.id }));
      await assert.rejects(() =>
        csv(reader, { ...filter, propertyId: property.id }),
      );
      await db.propertyGrant.create({
        data: { tenantId, userId: user.id, propertyId: property.id },
      });
      assert.equal((await csv(reader)).rows.length, readingIds.length);
      await db.reading.createMany({
        data: Array.from({ length: 1005 }, (_, index) => ({
          tenantId,
          meterId: meter.id,
          timestamp: new Date(Date.UTC(2026, 0, 2, 0, 0, index)),
          registerValue: "12345678901234.123456",
          consumption: "0.123456",
          measurementUnit: "m³",
          source: "MANUAL" as const,
        })),
      });
      const paged = await csv(reader);
      assert.equal(paged.rows.length, 1008);
      assert.equal(new Set(paged.rows.map((row) => row[0])).size, 1008);
      assert.ok(
        paged.rows.some((row) => row.includes("12345678901234.123456")),
      );
      await db.propertyGrant.deleteMany({
        where: { tenantId, userId: user.id },
      });
      assert.equal((await csv(reader)).rows.length, 0);
      await db.user.delete({ where: { id: user.id } });
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
