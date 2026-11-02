import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
const target = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(process.env.SEED_DEMO, "true");
assert.equal(target.hostname, "127.0.0.1");
assert.equal(target.port, "55435");
assert.equal(target.pathname, "/meterwerk_acceptance");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  log: [],
});
try {
  const tenant = await db.tenant.create({
    data: {
      id: "gateway-browser-tenant",
      name: "Gateway Browser Kunde",
      slug: "gateway-browser",
    },
  });
  const plan = await db.plan.findUniqueOrThrow({
    where: { code: "ENTERPRISE" },
    select: { id: true },
  });
  await db.subscription.create({
    data: { tenantId: tenant.id, planId: plan.id, status: "ACTIVE" },
  });
  await db.property.createMany({
    data: [
      {
        id: "gateway-browser-property-a",
        tenantId: tenant.id,
        name: "E2E Liegenschaft Alpha",
        address: "Teststraße 1",
        city: "Teststadt",
      },
      {
        id: "gateway-browser-property-b",
        tenantId: tenant.id,
        name: "E2E Liegenschaft Beta",
        address: "Teststraße 2",
        city: "Teststadt",
      },
    ],
  });
  const hash = (
    await db.user.findUniqueOrThrow({
      where: { email: "admin@meterwerk.demo" },
      select: { passwordHash: true },
    })
  ).passwordHash;
  for (const [role, email] of [
    ["TENANT_ADMIN", "gateway-tenant-admin@browser.invalid"],
    ["MANAGER", "gateway-manager@browser.invalid"],
    ["USER", "gateway-user@browser.invalid"],
  ] as const)
    await db.user.create({
      data: {
        tenantId: tenant.id,
        name: `Browser ${role}`,
        email,
        role,
        passwordHash: hash,
      },
    });
} finally {
  await db.$disconnect();
}
