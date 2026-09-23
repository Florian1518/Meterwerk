import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { changePlan } from "../src/server/licensing";
import { AccessError, type Actor } from "../src/server/policy";
import {
  confirmCsvImport,
  previewCsvImport,
  importHistory,
  skipImportErrors,
} from "../src/server/data-imports";

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
      const malformed = await previewCsvImport(
        actor,
        new File(
          [
            `meterId;timestamp;registerValue;consumption;measurementUnit;source\n${meter.id};2026-01-01T00:00:00Z;10;0.5;kWh;\n${meter.id};kein-datum;11;1;kWh;MANUAL\n${meter.id};2026-01-03T00:00:00Z;12.1234567;1;kWh;MANUAL`,
          ],
          "invalid-values.csv",
        ),
        null,
        "readings",
        {
          meterId: "meterId",
          timestamp: "timestamp",
          registerValue: "registerValue",
          consumption: "consumption",
          measurementUnit: "measurementUnit",
          source: "source",
        },
      );
      assert.equal(malformed.canConfirm, false);
      assert.ok(
        malformed.errors.some(
          (error) => error.row === 3 && error.field === "timestamp",
        ),
      );
      assert.ok(
        malformed.errors.some(
          (error) => error.row === 4 && error.field === "registerValue",
        ),
      );
      assert.equal(
        (
          await skipImportErrors(actor, null, malformed.id, {
            rows: [3, 4],
            reason: "Ungültige Zeit und Präzision auslassen",
          })
        ).canConfirm,
        true,
      );
      assert.equal(
        (await confirmCsvImport(actor, malformed.id, null)).imported,
        1,
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
  await check(
    "bulk error processing is owner-bound, audited and retained in history",
    async () => {
      const preview = await previewCsvImport(
        actor,
        new File(
          [
            "name;address;city\nHistory valid;Road 1;Berlin\n;Road 2;Berlin\n;Road 3;Berlin\n",
          ],
          "history.csv",
        ),
        null,
        "properties",
        { name: "name", address: "address", city: "city" },
      );
      const input = {
        rows: [3, 4],
        reason: "Fehlende Namen gesammelt auslassen",
      };
      await assert.rejects(() =>
        skipImportErrors(actor, foreignTenantId, preview.id, input),
      );
      await assert.rejects(() =>
        skipImportErrors(actor, null, "foreign-id", input),
      );
      await assert.rejects(() =>
        skipImportErrors(
          { ...actor, id: "another-admin" },
          null,
          preview.id,
          input,
        ),
      );
      for (const role of ["USER", "MANAGER"] as const) {
        await assert.rejects(() =>
          skipImportErrors({ ...actor, role }, null, preview.id, input),
        );
        await assert.rejects(() => importHistory({ ...actor, role }, null, {}));
      }
      await assert.rejects(() => importHistory(actor, foreignTenantId, {}));
      await assert.rejects(() => importHistory(platform, null, {}));
      await assert.rejects(() =>
        skipImportErrors(actor, null, preview.id, { ...input, rows: [2, 3] }),
      );
      assert.equal(
        (await db.dataImport.findUniqueOrThrow({ where: { id: preview.id } }))
          .skippedCount,
        0,
      );
      const result = await skipImportErrors(actor, null, preview.id, input);
      assert.equal(result.canConfirm, true);
      assert.equal(result.skippedCount, 2);
      await confirmCsvImport(actor, preview.id, null);
      const history = await importHistory(actor, null, {});
      const entry = history.items.find((item) => item.id === preview.id)!;
      assert.equal(entry.fileName, "history.csv");
      assert.equal(entry.actorName, actor.name);
      assert.equal(entry.rowCount, 3);
      assert.equal(entry.successCount, 1);
      assert.equal(entry.errorCount, 0);
      assert.equal(entry.skippedCount, 2);
      assert.equal(entry.status, "COMPLETED");
      assert.equal("stagedData" in entry, false);
      assert.equal(
        (
          await db.auditEvent.findFirstOrThrow({
            where: {
              tenantId,
              entityId: preview.id,
              action: "data_import.rows_skipped",
            },
          })
        ).actorId,
        actor.id,
      );
    },
  );
  await check(
    "history is paginated and expired previews survive new uploads",
    async () => {
      await db.dataImport.createMany({
        data: Array.from({ length: 27 }, (_, index) => ({
          tenantId,
          actorId: actor.id,
          resource: "properties",
          fingerprint: `history-${index}`,
          stagedData: [],
          errors: [],
          rowCount: 0,
          expiresAt: new Date(0),
        })),
      });
      const first = await importHistory(actor, null, {});
      assert.equal(first.items.length, 25);
      assert.ok(first.nextCursor);
      const second = await importHistory(actor, null, {
        cursor: first.nextCursor,
      });
      assert.ok(second.items.length > 0);
      assert.ok(
        second.items.every(
          (entry) => !first.items.some((item) => item.id === entry.id),
        ),
      );
      assert.ok(first.items.some((entry) => entry.status === "EXPIRED"));
      await previewCsvImport(
        actor,
        new File(["name;address;city\nRetained;A 1;Berlin"], "retained.csv"),
        null,
        "properties",
        { name: "name", address: "address", city: "city" },
      );
      assert.equal(
        await db.dataImport.count({
          where: { tenantId, fingerprint: { startsWith: "history-" } },
        }),
        27,
      );
    },
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
