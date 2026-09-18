import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { listResource, getMeter, listTenants } from "../src/server/data";
import { mutate } from "../src/server/mutations";
import { revokeGrant, writeResource } from "../src/server/crud";
import { hashPassword, verifyPassword } from "../src/server/password";
import { publicError } from "../src/server/errors";
import type { Actor } from "../src/server/policy";
if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error(
    "Integrationstests nur auf der lokalen Demo-Datenbank ausführen.",
  );
const tenantId = "demo-tenant-0";
const base: Actor = {
  id: `${tenantId}-user-0`,
  tenantId,
  role: "TENANT_ADMIN",
  name: "Test",
  email: "verwaltung@nordstern.demo",
};
const user: Actor = { ...base, id: `${tenantId}-user-2`, role: "USER" };
const admin: Actor = {
  ...base,
  id: "platform-admin",
  tenantId: null,
  role: "SUPER_ADMIN",
};
let count = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  count++;
  console.log(`PASS ${name}`);
}
try {
  const own = await db.meter.findFirstOrThrow({ where: { tenantId } });
  const foreign = await db.meter.findFirstOrThrow({
    where: { tenantId: "demo-tenant-1" },
  });
  await test("all resources are tenant scoped", async () => {
    for (const resource of [
      "properties",
      "buildings",
      "units",
      "meters",
      "users",
      "alarms",
      "readings",
    ] as const) {
      const rows = await listResource(base, resource);
      assert(rows.length);
      assert(rows.every((row) => row.tenantId === tenantId));
    }
  });
  await test("explicit foreign tenant rejected", async () => {
    await assert.rejects(() => listResource(base, "meters", "demo-tenant-1"));
  });
  await test("direct foreign meter access is not found", async () => {
    await assert.rejects(() => getMeter(base, foreign.id), { status: 404 });
  });
  await test("USER grants apply to descendants", async () => {
    const properties = await listResource(user, "properties");
    assert.equal(properties.length, 1);
    const meters = await listResource(user, "meters");
    assert.equal(
      meters.length,
      8 + Number(meters.some((m) => m.id === "demo-modbus-meter")),
    );
    const hidden = await db.meter.findFirstOrThrow({
      where: {
        tenantId,
        unit: { building: { propertyId: { not: properties[0].id } } },
      },
    });
    await assert.rejects(() => getMeter(user, hidden.id), { status: 404 });
  });
  await test("USER without grants sees no data", async () => {
    assert.equal(
      (await listResource({ ...user, id: "nonexistent" }, "meters")).length,
      0,
    );
  });
  await test("USER and MANAGER cannot write", async () => {
    for (const role of ["USER", "MANAGER"] as const)
      await assert.rejects(
        () =>
          mutate(
            { ...base, role },
            { kind: "properties", name: "Blocked", address: "x", city: "x" },
          ),
        { status: 403 },
      );
  });
  await test("MANAGER cannot list users or tenants", async () => {
    await assert.rejects(
      () => listResource({ ...base, role: "MANAGER" }, "users"),
      { status: 403 },
    );
    await assert.rejects(() => listTenants(base), { status: 403 });
  });
  await test("tenant admin cannot create platform admin", async () => {
    await assert.rejects(() =>
      mutate(base, {
        kind: "users",
        name: "Escalation",
        email: "escalation@example.com",
        password: "long-password-test",
        role: "SUPER_ADMIN",
      }),
    );
  });
  await test("foreign parent rejected by service", async () => {
    await assert.rejects(
      () =>
        mutate(base, {
          kind: "buildings",
          name: "Blocked",
          propertyId: "demo-tenant-1-property-0",
        }),
      { status: 404 },
    );
  });
  await test("database composite FK rejects foreign parent", async () => {
    await assert.rejects(() =>
      db.building.create({
        data: {
          tenantId,
          propertyId: "demo-tenant-1-property-0",
          name: "Invalid",
        },
      }),
    );
  });
  await test("database composite FK rejects foreign reading", async () => {
    await assert.rejects(() =>
      db.reading.create({
        data: {
          tenantId,
          meterId: foreign.id,
          timestamp: new Date(),
          registerValue: 1,
          consumption: 1,
          measurementUnit: "kWh",
          source: "MANUAL",
        },
      }),
    );
  });
  await test("cross-tenant grant rejected", async () => {
    await assert.rejects(
      () =>
        mutate(base, {
          kind: "grant",
          userId: user.id,
          propertyId: "demo-tenant-1-property-0",
        }),
      { status: 404 },
    );
  });
  await test("super admin can select either tenant", async () => {
    assert.equal(
      (await getMeter(admin, foreign.id, "demo-tenant-1")).id,
      foreign.id,
    );
    assert.equal((await getMeter(admin, own.id, tenantId)).id, own.id);
  });
  await test("password hashing verifies only correct password", async () => {
    const hash = await hashPassword("correct-test-password");
    assert(await verifyPassword(hash, "correct-test-password"));
    assert.equal(await verifyPassword(hash, "wrong"), false);
  });
  await test("valid write creates audit event atomically", async () => {
    const result = await mutate(base, {
      kind: "properties",
      name: `Test ${randomUUID()}`,
      address: "Teststraße",
      city: "Teststadt",
    });
    try {
      assert(
        await db.auditEvent.findFirst({
          where: { entityId: result.id, tenantId },
        }),
      );
    } finally {
      await db.auditEvent.deleteMany({ where: { entityId: result.id } });
      await db.property.delete({ where: { id: result.id } });
    }
  });
  await test("dependent objects and readings cannot be deleted implicitly", async () => {
    const property = await db.property.findFirstOrThrow({
      where: { tenantId },
    });
    const propertyId = property.id;
    await assert.rejects(
      () =>
        writeResource(base, "properties", "delete", {
          id: propertyId,
          confirmation: "DELETE",
        }),
      (error: unknown) => publicError(error).status === 409,
    );
    await assert.rejects(
      () =>
        writeResource(base, "meters", "delete", {
          id: own.id,
          confirmation: "DELETE",
        }),
      (error: unknown) => publicError(error).status === 409,
    );
  });
  await test("self protection and last tenant-admin invariant hold", async () => {
    await assert.rejects(
      () =>
        writeResource(base, "users", "delete", {
          id: base.id,
          confirmation: "DELETE",
        }),
      { status: 409 },
    );
    await assert.rejects(
      () =>
        writeResource(base, "users", "update", {
          id: base.id,
          name: "Lena",
          email: base.email,
          role: "MANAGER",
          active: true,
        }),
      { status: 409 },
    );
  });
  await test("grant revocation removes USER visibility", async () => {
    const property = (await listResource(user, "properties"))[0];
    assert(property);
    await revokeGrant(
      base,
      { userId: user.id, propertyId: property.id, confirmation: "DELETE" },
      tenantId,
    );
    try {
      assert.equal((await listResource(user, "properties")).length, 0);
      assert.equal((await listResource(user, "meters")).length, 0);
    } finally {
      await mutate(
        base,
        { kind: "grant", userId: user.id, propertyId: property.id },
        tenantId,
      );
    }
  });
  console.log(`${count} integration checks passed.`);
} finally {
  await db.$disconnect();
}
