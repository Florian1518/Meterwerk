import "dotenv/config";
import Decimal from "decimal.js";
import { afterAll, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  actor: {
    id: "utility-test",
    tenantId: "demo-multi-utility" as string | null,
    role: "TENANT_ADMIN",
    name: "Test",
    email: "test@example.invalid",
  },
}));
vi.mock("../src/server/auth", () => ({ requireActor: async () => auth.actor }));
import { db } from "../src/server/db";
import {
  utilityDetail,
  utilityReport,
  exportUtilityCsv,
  createTariff,
  configureUtility,
} from "../src/server/utility";
import { ingestUtility } from "../src/server/utility-ingestion";
import { hashDeviceToken, newDeviceToken } from "../src/server/device-auth";
import { VirtualWaterMeter } from "../src/lib/utility-simulator";
if (
  process.env.SEED_DEMO !== "true" ||
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Lokale Demo-Datenbank erforderlich.");
const tenantId = "demo-multi-utility",
  meterId = `${tenantId}-WATER`;
afterAll(async () => {
  await db.$disconnect();
});
describe.sequential("Utility database security and pipeline", () => {
  it("aggregates only the matching utility and canonical unit", async () => {
    const report = await utilityReport();
    for (const result of report.results) {
      const total = await db.reading.aggregate({
        where: {
          tenantId,
          meter: { type: result.utility },
          quality: { in: ["VALID", "ESTIMATED"] },
          timestamp: {
            gte: new Date(report.periods.month[0]),
            lt: new Date(report.periods.month[1]),
          },
        },
        _sum: { consumption: true },
      });
      expect(result.totals.month).toBe(
        total._sum.consumption?.toString() ?? "0",
      );
      const prices = {
        ELECTRICITY: "0.32",
        WATER: "2.10",
        GAS: "1.20",
        HEAT: "0.10",
      };
      expect(result.cost).toBe(
        new Decimal(result.totals.month).mul(prices[result.utility]).toFixed(2),
      );
    }
  });
  it("enforces tenant foreign keys on measurements", async () => {
    const reading = await db.reading.findFirstOrThrow({
      where: { tenantId, meterId },
    });
    await expect(
      db.measurement.create({
        data: {
          tenantId: "demo-tenant-0",
          readingId: reading.id,
          metric: "TEST_FOREIGN",
          value: "1",
          rawValue: "1",
          unit: "m3",
          rawUnit: "m3",
          quality: "VALID",
        },
      }),
    ).rejects.toThrow();
  });
  it("shows four separate media and excludes foreign tenants", async () => {
    const report = await utilityReport();
    expect(report.results.map((r) => r.unit)).toEqual([
      "kWh",
      "m3",
      "m3",
      "kWh",
    ]);
    await expect(utilityReport("demo-tenant-0")).rejects.toMatchObject({
      status: 403,
    });
    await expect(utilityDetail("foreign-id")).rejects.toMatchObject({
      status: 404,
    });
  });
  it("requires grants for detail, export and aggregates", async () => {
    auth.actor.role = "USER";
    await expect(utilityDetail(meterId)).rejects.toMatchObject({ status: 404 });
    await expect(
      exportUtilityCsv(meterId, {
        from: "2026-09-01T00:00:00Z",
        to: "2026-09-22T00:00:00Z",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await utilityReport()).results.every((r) => r.totals.month === "0"),
    ).toBe(true);
    await expect(createTariff({})).rejects.toMatchObject({ status: 403 });
    await expect(configureUtility(meterId, {})).rejects.toMatchObject({
      status: 403,
    });
    auth.actor.role = "TENANT_ADMIN";
  });
  it("requires SUPER_ADMIN to select a tenant", async () => {
    auth.actor.role = "SUPER_ADMIN";
    auth.actor.tenantId = null;
    await expect(utilityReport()).rejects.toMatchObject({ status: 400 });
    auth.actor.role = "TENANT_ADMIN";
    auth.actor.tenantId = tenantId;
  });
  it("exports raw and normalized values with UTC and quality", async () => {
    const csv = await exportUtilityCsv(meterId, {
      from: new Date(Date.now() - 86400000 * 2).toISOString(),
      to: new Date(Date.now() + 60000).toISOString(),
    });
    expect(csv).toContain('"Rohwert"');
    expect(csv).toContain('"Normalisierter Wert"');
    expect(csv).toContain('"WATER"');
    expect(csv).not.toContain('"VOLTAGE_L1"');
  });
  it("preserves tariff history and rejects overlaps, foreign meters and role escalation", async () => {
    const year = 2100 + Math.floor(Math.random() * 100);
    const input = {
      meterId,
      utility: "WATER",
      validFrom: `${year}-01-01T00:00:00Z`,
      validTo: `${year}-02-01T00:00:00Z`,
      unit: "m3",
      price: "2.5",
    };
    const created = await createTariff(input);
    try {
      await expect(createTariff(input)).rejects.toMatchObject({ status: 409 });
      await expect(
        createTariff({ ...input, meterId: "foreign" }),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      await db.tariff.delete({ where: { id: created.id } });
    }
  });
  it("ingests, normalizes and deduplicates atomically", async () => {
    const token = newDeviceToken();
    const credential = await db.deviceCredential.create({
      data: { tenantId, deviceId: meterId, tokenHash: hashDeviceToken(token) },
    });
    try {
      const last = await db.reading.findFirstOrThrow({
        where: { tenantId, meterId },
        orderBy: { timestamp: "desc" },
      });
      const frame = new VirtualWaterMeter(last.registerValue.toString()).sample(
        new Date(),
      );
      const result = await ingestUtility(`Bearer ${token}`, frame);
      expect((await ingestUtility(`Bearer ${token}`, frame)).duplicate).toBe(
        true,
      );
      expect(
        await db.measurement.count({ where: { readingId: result.id } }),
      ).toBe(4);
      expect(
        await db.auditEvent.count({
          where: { entityId: result.id, action: "utility.ingest" },
        }),
      ).toBe(1);
      await expect(
        ingestUtility(`Bearer ${token}`, { ...frame, tenantId: "foreign" }),
      ).rejects.toThrow();
      await expect(
        ingestUtility(`Bearer ${token}`, {
          ...frame,
          messageId: "invalid",
          measurements: [{ metric: "VOLTAGE_L1", value: "230", unit: "V" }],
        }),
      ).rejects.toThrow();
      await db.deviceCredential.update({
        where: { id: credential.id },
        data: { status: "REVOKED" },
      });
      await expect(
        ingestUtility(`Bearer ${token}`, frame),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await db.deviceCredential.delete({ where: { id: credential.id } });
    }
  });
});
