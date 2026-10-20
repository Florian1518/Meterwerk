import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { hashPassword } from "../../src/server/password";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.USER_MANAGEMENT_RELEASE_GATE !== "true" ||
  databaseUrl.protocol !== "postgresql:" ||
  databaseUrl.hostname !== "127.0.0.1" ||
  databaseUrl.pathname !== "/release_test"
) {
  throw new Error(
    "User-management browser fixtures require the isolated release database.",
  );
}

const tenantId = process.env.USER_MANAGEMENT_BROWSER_TENANT_ID;
const foreignTenantId = process.env.USER_MANAGEMENT_BROWSER_FOREIGN_TENANT_ID;
const adminEmail = process.env.USER_MANAGEMENT_BROWSER_ADMIN_EMAIL;
const password = process.env.USER_MANAGEMENT_BROWSER_PASSWORD;
if (
  !tenantId ||
  !foreignTenantId ||
  tenantId === foreignTenantId ||
  !adminEmail ||
  !password
) {
  throw new Error(
    "User-management browser fixture configuration is incomplete.",
  );
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl.toString() }),
});

try {
  const plan = await db.plan.upsert({
    where: { code: "BASIC" },
    update: {},
    create: {
      id: `${tenantId}-basic-plan`,
      code: "BASIC",
      name: "Synthetischer E2E Basic-Plan",
      maxProperties: 5,
      maxMeters: 100,
      maxUsers: 25,
      maxGateways: 5,
      supportLevel: "STANDARD",
    },
  });
  await db.tenant.create({
    data: {
      id: tenantId,
      name: "Synthetischer User-Management-Tenant",
      slug: `${tenantId}-slug`,
    },
  });
  await db.tenant.create({
    data: {
      id: foreignTenantId,
      name: "Synthetischer Fremd-Tenant",
      slug: `${foreignTenantId}-slug`,
    },
  });
  await db.property.create({
    data: {
      id: `${tenantId}-property-a`,
      tenantId,
      name: "E2E Liegenschaft Alpha",
      address: "Teststraße 1",
      city: "Teststadt",
    },
  });
  await db.subscription.create({
    data: {
      id: `${tenantId}-active-subscription`,
      tenantId,
      planId: plan.id,
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 60_000),
    },
  });
  await db.property.create({
    data: {
      id: `${tenantId}-property-b`,
      tenantId,
      name: "E2E Liegenschaft Beta",
      address: "Teststraße 2",
      city: "Teststadt",
    },
  });
  await db.user.create({
    data: {
      name: "Synthetischer Plattformadministrator",
      email: adminEmail,
      passwordHash: await hashPassword(password),
      role: "SUPER_ADMIN",
      tenantId: null,
      active: true,
    },
  });
  console.log("Created isolated user-management browser fixtures.");
} finally {
  await db.$disconnect();
}
