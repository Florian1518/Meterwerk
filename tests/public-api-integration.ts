import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { changePlan } from "../src/server/licensing";
import { publicError } from "../src/server/errors";
import {
  authenticatePublicApiKey,
  consumePublicApiRateLimit,
  createPublicApiKey,
  listPublicApiKeys,
  publicApiRateLimit,
  readPublicResource,
  revokePublicApiKey,
} from "../src/server/public-api";
import type { Actor } from "../src/server/policy";

if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Lokale Demo-Datenbank erforderlich.");
const tenantId = `public-api-${randomUUID()}`;
const foreignTenantId = `public-api-${randomUUID()}`;
const admin: Actor = {
  id: "platform-admin",
  tenantId: null,
  role: "SUPER_ADMIN",
  name: "Platform",
  email: "platform@example.invalid",
};
const tenantAdmin: Actor = {
  id: `${tenantId}-admin`,
  tenantId,
  role: "TENANT_ADMIN",
  name: "Tenant",
  email: "tenant@example.invalid",
};
let checks = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}
try {
  await db.tenant.createMany({
    data: [
      { id: tenantId, name: "Public API test", slug: tenantId },
      { id: foreignTenantId, name: "Foreign API test", slug: foreignTenantId },
    ],
  });
  await changePlan(admin, { tenantId, plan: "BASIC" });
  await changePlan(admin, { tenantId: foreignTenantId, plan: "BASIC" });
  const property = await db.property.create({
    data: { tenantId, name: "API property", address: "Test 1", city: "Berlin" },
  });
  const foreignProperty = await db.property.create({
    data: {
      tenantId: foreignTenantId,
      name: "Foreign property",
      address: "Test 2",
      city: "Berlin",
    },
  });
  const building = await db.building.create({
    data: { tenantId, propertyId: property.id, name: "API building" },
  });
  const unit = await db.unit.create({
    data: {
      tenantId,
      buildingId: building.id,
      name: "API unit",
      floor: "1",
      area: "45",
    },
  });
  const meter = await db.meter.create({
    data: {
      tenantId,
      unitId: unit.id,
      serialNumber: "public-api-meter",
      type: "WATER",
      manufacturer: "Test",
      model: "Virtual",
      measurementUnit: "m³",
      location: "Test",
      installedAt: new Date(),
      demoPricePerUnit: "0",
    },
  });
  const user = await db.user.create({
    data: {
      tenantId,
      name: "API report author",
      email: `${tenantId}@example.invalid`,
      passwordHash: "non-login-test-account",
      role: "TENANT_ADMIN",
    },
  });
  const reading = await db.reading.create({
    data: {
      tenantId,
      meterId: meter.id,
      timestamp: new Date("2026-09-01T00:00:00Z"),
      registerValue: "12.5",
      consumption: "1.5",
      measurementUnit: "m³",
      source: "MANUAL",
      quality: "VALID",
    },
  });
  const alarm = await db.alarm.create({
    data: {
      tenantId,
      meterId: meter.id,
      title: "API test alarm",
      severity: "LOW",
    },
  });
  await db.report.create({
    data: {
      tenantId,
      createdById: user.id,
      type: "MONTHLY",
      title: "API test report",
      periodFrom: new Date("2026-09-01T00:00:00Z"),
      periodTo: new Date("2026-10-01T00:00:00Z"),
      content: { summary: "Test" },
    },
  });

  const created = await createPublicApiKey(tenantAdmin, {
    name: "Integration key",
    description: "Read only",
    scopes: [
      "properties:read",
      "buildings:read",
      "units:read",
      "meters:read",
      "readings:read",
      "alarms:read",
      "reports:read",
    ],
  });
  await check(
    "valid bearer key is hashed, returned once, and updates lastUsedAt",
    async () => {
      assert.ok(created.token.startsWith("mwk_pub_"));
      const stored = await db.publicApiKey.findUniqueOrThrow({
        where: { id: created.id },
      });
      assert.notEqual(stored.keyHash, created.token);
      assert.equal(stored.keyHash.length, 64);
      await authenticatePublicApiKey(`Bearer ${created.token}`);
      const keys = await listPublicApiKeys(tenantAdmin);
      assert.equal(keys.length, 1);
      assert.equal("keyHash" in keys[0]!, false);
      assert.equal("token" in keys[0]!, false);
      assert.ok(
        (await db.publicApiKey.findUniqueOrThrow({ where: { id: created.id } }))
          .lastUsedAt,
      );
    },
  );
  await check(
    "bad key is rejected with generic unauthorized response",
    async () => {
      await assert.rejects(
        () => authenticatePublicApiKey("Bearer mwk_pub_not-a-valid-key"),
        { status: 401 },
      );
      await assert.rejects(() => authenticatePublicApiKey(null), {
        status: 401,
      });
    },
  );
  await check(
    "every supported resource is tenant filtered and time filters constrain readings",
    async () => {
      const credential = await authenticatePublicApiKey(
        `Bearer ${created.token}`,
      );
      for (const resource of [
        "properties",
        "buildings",
        "units",
        "meters",
        "alarms",
        "reports",
      ] as const) {
        const response = await readPublicResource(credential, resource, {});
        assert.equal(
          response.data.length,
          1,
          `${resource} should return its tenant row`,
        );
      }
      const readings = await readPublicResource(credential, "readings", {
        from: "2026-09-01T00:00:00Z",
        to: "2026-09-02T00:00:00Z",
        limit: "1",
      });
      assert.equal(readings.data[0]?.id, reading.id);
      const outsidePeriod = await readPublicResource(credential, "readings", {
        from: "2026-09-02T00:00:00Z",
        to: "2026-09-03T00:00:00Z",
      });
      assert.equal(outsidePeriod.data.length, 0);
      await assert.rejects(
        () =>
          readPublicResource(credential, "readings", {
            from: "2026-09-02T00:00:00Z",
            to: "2026-09-01T00:00:00Z",
          }),
        { status: 400 },
      );
      assert.equal(alarm.tenantId, tenantId);
      assert.equal(foreignProperty.tenantId, foreignTenantId);
    },
  );
  await check(
    "pagination returns a cursor and enforces the page-size cap",
    async () => {
      await db.property.create({
        data: {
          tenantId,
          name: "Second property",
          address: "Test 3",
          city: "Berlin",
        },
      });
      const credential = await authenticatePublicApiKey(
        `Bearer ${created.token}`,
      );
      const page = await readPublicResource(credential, "properties", {
        limit: "1",
      });
      assert.equal(page.data.length, 1);
      assert.ok(page.pagination.nextCursor);
      const nextPage = await readPublicResource(credential, "properties", {
        limit: "1",
        cursor: page.pagination.nextCursor!,
      });
      assert.equal(nextPage.data.length, 1);
      assert.notEqual(nextPage.data[0]?.id, page.data[0]?.id);
      await assert.rejects(
        () => readPublicResource(credential, "properties", { limit: "101" }),
        (error: unknown) => publicError(error).status === 400,
      );
    },
  );
  await check(
    "tenant boundary and scopes reject unauthorized reads",
    async () => {
      const credential = await authenticatePublicApiKey(
        `Bearer ${created.token}`,
      );
      await assert.rejects(
        () =>
          readPublicResource(credential, "properties", {
            tenantId: foreignTenantId,
          }),
        { status: 403 },
      );
      await assert.rejects(
        () =>
          createPublicApiKey(tenantAdmin, {
            tenantId: foreignTenantId,
            name: "Foreign attempt",
            scopes: ["properties:read"],
          }),
        { status: 403 },
      );
      const readOnly = await createPublicApiKey(tenantAdmin, {
        name: "Limited key",
        scopes: ["properties:read"],
      });
      const restrictedCredential = await authenticatePublicApiKey(
        `Bearer ${readOnly.token}`,
      );
      await assert.rejects(
        () => readPublicResource(restrictedCredential, "meters", {}),
        { status: 403 },
      );
      await revokePublicApiKey(tenantAdmin, readOnly.id);
      await assert.rejects(
        () => authenticatePublicApiKey(`Bearer ${readOnly.token}`),
        { status: 401 },
      );
    },
  );
  await check("revoked keys stop authenticating", async () => {
    await revokePublicApiKey(tenantAdmin, created.id);
    await assert.rejects(
      () => authenticatePublicApiKey(`Bearer ${created.token}`),
      { status: 401 },
    );
    assert.ok(
      (await db.publicApiKey.findUniqueOrThrow({ where: { id: created.id } }))
        .revokedAt,
    );
  });
  await check(
    "per-key rate limiting returns HTTP 429 at the configured threshold",
    async () => {
      const limited = await createPublicApiKey(tenantAdmin, {
        name: "Rate key",
        scopes: ["properties:read"],
      });
      for (let i = 0; i < publicApiRateLimit; i++)
        await consumePublicApiRateLimit(limited.id, tenantId);
      await assert.rejects(
        () => consumePublicApiRateLimit(limited.id, tenantId),
        { status: 429 },
      );
    },
  );
  await check(
    "only tenant administrators and platform admins manage keys",
    async () => {
      await assert.rejects(
        () => listPublicApiKeys({ ...tenantAdmin, role: "MANAGER" }),
        { status: 403 },
      );
      await assert.rejects(
        () => listPublicApiKeys(tenantAdmin, foreignTenantId),
        { status: 403 },
      );
      assert.ok((await listPublicApiKeys(admin, tenantId)).length >= 2);
      await assert.rejects(
        () =>
          createPublicApiKey(admin, {
            tenantId,
            name: "Platform mutation attempt",
            scopes: ["properties:read"],
          }),
        { status: 403 },
      );
    },
  );
  console.log(`${checks} public API checks passed.`);
} finally {
  await db.auditEvent.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.publicApiKey.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.report.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.alarm.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.reading.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.user.deleteMany({
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
