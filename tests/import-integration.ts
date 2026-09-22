import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { changePlan } from "../src/server/licensing";
import { AccessError, type Actor } from "../src/server/policy";
import { confirmCsvImport, previewCsvImport } from "../src/server/data-imports";

if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Lokale Demo-Datenbank erforderlich.");
const tenantId = `csv-import-${randomUUID()}`;
const foreignTenantId = `csv-import-foreign-${randomUUID()}`;
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
  name: "Import Admin",
  email: "import@example.invalid",
};
const checks: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  await run();
  checks.push(name);
  console.log(`PASS ${name}`);
}
try {
  await db.tenant.createMany({
    data: [
      { id: tenantId, name: "CSV import", slug: tenantId },
      { id: foreignTenantId, name: "CSV foreign", slug: foreignTenantId },
    ],
  });
  await changePlan(platform, { tenantId, plan: "BASIC" });
  await changePlan(platform, { tenantId: foreignTenantId, plan: "BASIC" });
  const foreignProperty = await db.property.create({
    data: {
      tenantId: foreignTenantId,
      name: "Foreign property",
      address: "Other 1",
      city: "Berlin",
    },
  });

  await check(
    "valid CSV preview confirms atomically and audits the import",
    async () => {
      const file = new File(
        ["name;address;city\nParkhaus;Teststraße 1;Berlin\n"],
        "properties.csv",
        { type: "text/csv" },
      );
      const preview = await previewCsvImport(actor, file, null, "properties", {
        name: "name",
        address: "address",
        city: "city",
      });
      assert.equal(preview.canConfirm, true);
      const result = await confirmCsvImport(actor, preview.id, null);
      assert.equal(result.imported, 1);
      assert.equal(
        await db.property.count({ where: { tenantId, name: "Parkhaus" } }),
        1,
      );
      assert.equal(
        await db.auditEvent.count({
          where: {
            tenantId,
            entityId: preview.id,
            action: "data_import.completed",
          },
        }),
        1,
      );
      await assert.rejects(
        () => confirmCsvImport(actor, preview.id, null),
        (error: unknown) =>
          error instanceof AccessError && error.status === 409,
      );
      await assert.rejects(
        () =>
          previewCsvImport(actor, file, null, "properties", {
            name: "name",
            address: "address",
            city: "city",
          }),
        (error: unknown) =>
          error instanceof AccessError && error.status === 409,
      );
    },
  );

  await check(
    "cross-tenant reference is reported and critical errors prevent all writes",
    async () => {
      const file = new File(
        [
          `propertyId;name\n${foreignProperty.id};Unsafe building\nmissing-id;Also unsafe\n`,
        ],
        "buildings.csv",
        { type: "text/csv" },
      );
      const preview = await previewCsvImport(actor, file, null, "buildings", {
        propertyId: "propertyId",
        name: "name",
      });
      assert.equal(preview.canConfirm, false);
      assert.ok(preview.errors.some((error) => error.field === "propertyId"));
      await assert.rejects(
        () => confirmCsvImport(actor, preview.id, null),
        (error: unknown) =>
          error instanceof AccessError && error.status === 409,
      );
      assert.equal(await db.building.count({ where: { tenantId } }), 0);
    },
  );

  await check(
    "tenant administrators cannot preview imports in another tenant",
    async () => {
      const file = new File(
        ["name;address;city\nForbidden;Test 1;Berlin\n"],
        "properties.csv",
        { type: "text/csv" },
      );
      await assert.rejects(
        () =>
          previewCsvImport(actor, file, foreignTenantId, "properties", {
            name: "name",
            address: "address",
            city: "city",
          }),
        (error: unknown) =>
          error instanceof AccessError && error.status === 403,
      );
    },
  );

  await check(
    "a batch exceeding the subscription quota writes no partial rows",
    async () => {
      const rows = Array.from(
        { length: 5 },
        (_, index) => `Quota ${index};Quota ${index} address;Berlin`,
      ).join("\n");
      const file = new File([`name;address;city\n${rows}\n`], "quota.csv", {
        type: "text/csv",
      });
      const preview = await previewCsvImport(actor, file, null, "properties", {
        name: "name",
        address: "address",
        city: "city",
      });
      assert.equal(preview.canConfirm, true);
      await assert.rejects(
        () => confirmCsvImport(actor, preview.id, null),
        (error: unknown) =>
          error instanceof AccessError && error.status === 409,
      );
      assert.equal(await db.property.count({ where: { tenantId } }), 1);
    },
  );

  await check(
    "duplicate historical readings and mismatched measurement units are rejected",
    async () => {
      const property = await db.property.create({
        data: {
          tenantId,
          name: "Meter property",
          address: "Meter 1",
          city: "Hamburg",
        },
      });
      const building = await db.building.create({
        data: { tenantId, propertyId: property.id, name: "Building" },
      });
      const unit = await db.unit.create({
        data: {
          tenantId,
          buildingId: building.id,
          name: "Unit",
          floor: "EG",
          area: "40.00",
        },
      });
      const meter = await db.meter.create({
        data: {
          tenantId,
          unitId: unit.id,
          serialNumber: `${tenantId}-serial`,
          type: "ELECTRICITY",
          manufacturer: "Test",
          model: "M1",
          measurementUnit: "kWh",
          location: "EG",
          installedAt: new Date("2025-01-01T00:00:00Z"),
          demoPricePerUnit: "0.2500",
        },
      });
      const csv = `meterId;timestamp;registerValue;consumption;measurementUnit;source\n${meter.id};2026-09-23T10:00:00+02:00;1000,5;1,5;kWh;MANUAL\n${meter.id};2026-09-23T10:00:00+02:00;1000,5;1,5;kWh;MANUAL\n${meter.id};2026-09-23T11:00:00+02:00;1002;1,5;m³;MANUAL\n`;
      const file = new File([csv], "readings.csv", { type: "text/csv" });
      const preview = await previewCsvImport(actor, file, null, "readings", {
        meterId: "meterId",
        timestamp: "timestamp",
        registerValue: "registerValue",
        consumption: "consumption",
        measurementUnit: "measurementUnit",
        source: "source",
      });
      assert.equal(preview.canConfirm, false);
      assert.ok(
        preview.errors.some((error) =>
          error.message.includes("Doppelter Datensatz"),
        ),
      );
      assert.ok(
        preview.errors.some((error) => error.field === "measurementUnit"),
      );
      assert.equal(
        await db.reading.count({ where: { tenantId, meterId: meter.id } }),
        0,
      );
    },
  );

  await assert.rejects(
    () =>
      previewCsvImport(
        { ...actor, role: "USER" },
        new File(["a;b\n1;2"], "x.csv"),
        null,
        "properties",
        {},
      ),
    (error: unknown) => error instanceof AccessError && error.status === 403,
  );
  console.log(`${checks.length + 1} CSV import integration checks passed.`);
} finally {
  await db.auditEvent.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.dataImport.deleteMany({
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
