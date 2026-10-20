import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Actor } from "../src/server/policy";
import { defaultConfig, profiles } from "../src/lib/modbus/contracts";
import { reserveFreeTcpPort } from "./helpers/free-tcp-port";
vi.mock("@/server/db", () => ({ db }));
vi.mock("@/server/auth", () => ({ requireActor: async () => actor }));
vi.mock("@/server/licensing", () => ({
  requireTenantFeature: vi.fn(),
  recordTenantUsage: vi.fn(),
  requireTenantQuota: vi.fn(),
}));

// Fresh loopback-only cluster; never uses .env, a seed or an existing database.
mkdirSync(".local", { recursive: true });
const directory = mkdtempSync(resolve(".local/gateway-security-test-"));
const portReservation = await reserveFreeTcpPort();
const { port } = portReservation;
const url = `postgresql://phase1a@127.0.0.1:${port}/phase1a`;
const postgres = new EmbeddedPostgres({
  databaseDir: directory,
  user: "phase1a",
  password: "",
  port,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
  log: [],
});
let actor: Actor;
let management: typeof import("../src/server/device-management");
let fleet: typeof import("../src/server/device-fleet-part3");
let credentials: typeof import("../src/server/device-auth");
let gatewayCredentials: typeof import("../src/server/gateway-credentials");
let modbus: typeof import("../src/server/modbus");
let rotate: typeof import("../src/server/device-fleet");
let adminUi: typeof import("../src/server/gateway-admin");
let started = false;
let serial = 0;
let own: Awaited<ReturnType<typeof fixture>>;
let hidden: Awaited<ReturnType<typeof fixture>>;
let foreign: Awaited<ReturnType<typeof fixture>>;
const admin: Actor = {
  id: "phase-admin",
  tenantId: "phase-tenant",
  role: "TENANT_ADMIN",
  name: "Admin",
  email: "admin@example.invalid",
};
const user: Actor = { ...admin, id: "phase-user", role: "USER" };

async function fixture(tenantId = admin.tenantId!, gatewayId?: string) {
  const key = `fixture-${++serial}`;
  const property = await db.property.create({
    data: { tenantId, name: key, address: "Test", city: "Test" },
  });
  const building = await db.building.create({
    data: { tenantId, propertyId: property.id, name: key },
  });
  const unit = await db.unit.create({
    data: {
      tenantId,
      buildingId: building.id,
      name: key,
      floor: "0",
      area: "1",
    },
  });
  const meter = await db.meter.create({
    data: {
      tenantId,
      unitId: unit.id,
      serialNumber: key,
      type: "ELECTRICITY",
      manufacturer: "Test",
      model: "Test",
      measurementUnit: "kWh",
      location: "Test",
      installedAt: new Date(),
      demoPricePerUnit: "0",
    },
  });
  const gateway = gatewayId
    ? await db.gateway.findUniqueOrThrow({ where: { id: gatewayId } })
    : await db.gateway.create({
        data: {
          tenantId,
          name: key,
          externalGatewayId: key,
          manufacturer: "Test",
          model: "Test",
          installedAt: new Date(),
          status: "ONLINE",
          lastSeenAt: new Date(),
        },
      });
  const device = await db.device.create({
    data: {
      tenantId,
      meterId: meter.id,
      gatewayId: gateway.id,
      externalDeviceId: key,
      manufacturer: "Test",
      model: "Test",
      protocol: "MODBUS",
      status: "ONLINE",
      lifecycleStatus: "ACTIVE",
      installedAt: new Date(),
    },
  });
  await db.modbusConfiguration.create({
    data: {
      tenantId,
      deviceId: device.id,
      configuration: defaultConfig,
      profile: profiles[0],
      state: "ACTIVE",
      completedAt: new Date(),
      reviewedRevision: 1,
      confirmedUnitId: unit.id,
      pollingEnabled: true,
    },
  });
  return { property, unit, meter, gateway, device };
}

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const binaries = await (
    await import(
      pathToFileURL(
        resolve(dirname(require.resolve("embedded-postgres")), "binary.js"),
      ).href
    )
  ).default();
  execFileSync(
    binaries.initdb,
    [
      "-D",
      directory,
      "-U",
      "phase1a",
      "--auth=trust",
      "--encoding=UTF8",
      "--locale=C",
    ],
    { stdio: "pipe", windowsHide: true },
  );
  await portReservation.release();
  await postgres.start();
  started = true;
  await postgres.createDatabase("phase1a");
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      stdio: "pipe",
      windowsHide: true,
      env: {
        ...process.env,
        DATABASE_URL: url,
        METERWERK_ENV: "test",
        DOTENV_CONFIG_PATH: resolve(directory, "absent.env"),
      },
    },
  );
  management = await import("../src/server/device-management");
  fleet = await import("../src/server/device-fleet-part3");
  credentials = await import("../src/server/device-auth");
  gatewayCredentials = await import("../src/server/gateway-credentials");
  modbus = await import("../src/server/modbus");
  rotate = await import("../src/server/device-fleet");
  adminUi = await import("../src/server/gateway-admin");
  for (const id of [admin.tenantId!, "phase-foreign"])
    await db.tenant.create({ data: { id, name: id, slug: id } });
  await db.user.create({
    data: {
      ...user,
      passwordHash: "unused-synthetic-fixture",
      email: "user@example.invalid",
    },
  });
  own = await fixture();
  hidden = await fixture();
  foreign = await fixture("phase-foreign");
  await db.propertyGrant.create({
    data: {
      tenantId: admin.tenantId!,
      userId: user.id,
      propertyId: own.property.id,
    },
  });
}, 120000);
beforeEach(() => {
  actor = admin;
});
afterAll(async () => {
  await portReservation.release();
  await db.$disconnect();
  if (started) await postgres.stop();
});

it("USER with grant can read compliance and gateway health", async () => {
  actor = user;
  expect((await fleet.deviceCompliance(own.device.id)).deviceId).toBe(
    own.device.id,
  );
  expect((await fleet.gatewayHealth(own.gateway.id)).connectedDevices).toBe(1);
});
it.each(["no-grant", "other-property", "foreign-tenant"])(
  "denies USER scope %s",
  async (kind) => {
    actor = kind === "no-grant" ? { ...user, id: "user-without-grants" } : user;
    const target =
      kind === "foreign-tenant"
        ? foreign
        : kind === "other-property"
          ? hidden
          : own;
    await expect(
      fleet.deviceCompliance(target.device.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(fleet.gatewayHealth(target.gateway.id)).rejects.toMatchObject({
      status: 404,
    });
  },
);
it.each(["USER", "MANAGER", "TENANT_ADMIN"] as const)(
  "rejects foreign requested tenant for %s",
  async (role) => {
    actor = { ...user, role };
    await expect(
      fleet.deviceCompliance(foreign.device.id, "phase-foreign"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      fleet.gatewayHealth(foreign.gateway.id, "phase-foreign"),
    ).rejects.toMatchObject({ status: 403 });
  },
);
it.each(["MANAGER", "TENANT_ADMIN", "SUPER_ADMIN"] as const)(
  "preserves allowed %s access",
  async (role) => {
    actor = {
      ...admin,
      role,
      tenantId: role === "SUPER_ADMIN" ? null : admin.tenantId,
    };
    expect(
      (await fleet.deviceCompliance(hidden.device.id, admin.tenantId)).deviceId,
    ).toBe(hidden.device.id);
    expect(
      (await fleet.gatewayHealth(hidden.gateway.id, admin.tenantId)).gatewayId,
    ).toBe(hidden.gateway.id);
  },
);
it("SUPER_ADMIN must explicitly select a tenant", async () => {
  actor = { ...admin, role: "SUPER_ADMIN", tenantId: null };
  await expect(fleet.deviceCompliance(own.device.id)).rejects.toMatchObject({
    status: 400,
  });
  await expect(fleet.gatewayHealth(own.gateway.id)).rejects.toMatchObject({
    status: 400,
  });
});
it("shared gateway counts and command health exclude ungranted devices", async () => {
  const shared = await fixture(admin.tenantId!, own.gateway.id);
  await db.gatewayCommand.create({
    data: {
      tenantId: admin.tenantId!,
      gatewayId: own.gateway.id,
      deviceId: shared.device.id,
      action: "TEST",
      revision: 1,
      status: "FAILED",
      expiresAt: new Date(),
    },
  });
  await rotate.createMaintenanceWindow({
    deviceId: shared.device.id,
    gatewayId: own.gateway.id,
    startsAt: new Date(Date.now() - 10000).toISOString(),
    endsAt: new Date(Date.now() + 60000).toISOString(),
    reason: "Hidden device maintenance",
  });
  actor = user;
  const result = await fleet.gatewayHealth(own.gateway.id);
  expect(result.connectedDevices).toBe(1);
  expect(result.status).toBe("CRITICAL");
  expect(result.reasons).not.toContain("Fehlgeschlagene Commands");
});

it("decommissions atomically, revokes active tokens and preserves revoked credentials", async () => {
  const f = await fixture();
  const first = await credentials.issueDeviceToken(admin, {
    deviceId: f.device.id,
  });
  const second = await credentials.issueDeviceToken(admin, {
    deviceId: f.device.id,
  });
  const old = await db.deviceCredential.findFirstOrThrow({
    where: { deviceId: f.device.id, status: "REVOKED" },
  });
  await db.gatewayCommand.create({
    data: {
      tenantId: admin.tenantId!,
      gatewayId: f.gateway.id,
      deviceId: f.device.id,
      action: "START",
      revision: 1,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  await management.changeDeviceLifecycle(f.device.id, "DECOMMISSIONED");
  expect(
    await db.device.findUnique({ where: { id: f.device.id } }),
  ).toMatchObject({ lifecycleStatus: "DECOMMISSIONED", status: "DISABLED" });
  expect(
    await db.modbusConfiguration.findUnique({
      where: { deviceId: f.device.id },
    }),
  ).toMatchObject({ state: "DISABLED", pollingEnabled: false });
  expect(
    await db.deviceCredential.count({
      where: { deviceId: f.device.id, status: "ACTIVE" },
    }),
  ).toBe(0);
  expect(
    (await db.deviceCredential.findUniqueOrThrow({ where: { id: old.id } }))
      .revokedAt,
  ).toEqual(old.revokedAt);
  expect(
    await db.gatewayCommand.count({
      where: { deviceId: f.device.id, status: "PENDING" },
    }),
  ).toBe(0);
  await expect(
    credentials.authenticateDevice(`Bearer ${first.token}`),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    credentials.authenticateDevice(`Bearer ${second.token}`),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    credentials.issueDeviceToken(admin, { deviceId: f.device.id }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    rotate.rotateDeviceCredential(f.device.id),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    management.changeDeviceLifecycle(f.device.id, "ACTIVE"),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.auditEvent.count({
      where: { entityId: f.device.id, action: "device.lifecycle.change" },
    }),
  ).toBe(1);
});
it("rejects lifecycle-only legacy decommissioned state during authentication", async () => {
  const f = await fixture();
  const issued = await credentials.issueDeviceToken(admin, {
    deviceId: f.device.id,
  });
  await db.device.update({
    where: { id: f.device.id },
    data: { lifecycleStatus: "DECOMMISSIONED" },
  });
  await expect(
    credentials.authenticateDevice(`Bearer ${issued.token}`),
  ).rejects.toMatchObject({ status: 403 });
});
it("rejects foreign lifecycle IDs and invalid transitions without mutation", async () => {
  await expect(
    management.changeDeviceLifecycle(foreign.device.id, "DECOMMISSIONED"),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    management.changeDeviceLifecycle(own.device.id, "NEW"),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await db.device.findUniqueOrThrow({ where: { id: foreign.device.id } }))
      .lifecycleStatus,
  ).toBe("ACTIVE");
});
it.each(["USER", "MANAGER"] as const)(
  "does not permit %s lifecycle/token role escalation",
  async (role) => {
    actor = { ...user, role };
    await expect(
      management.changeDeviceLifecycle(own.device.id, "DECOMMISSIONED"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      credentials.issueDeviceToken(actor, { deviceId: own.device.id }),
    ).rejects.toMatchObject({ status: 403 });
  },
);
it("bulk decommissioning uses the same terminal state rules", async () => {
  const f = await fixture();
  await credentials.issueDeviceToken(admin, { deviceId: f.device.id });
  await management.bulkDeviceAction({
    ids: [f.device.id],
    action: "SET_STATUS",
    status: "DECOMMISSIONED",
  });
  expect(
    (await db.device.findUniqueOrThrow({ where: { id: f.device.id } })).status,
  ).toBe("DISABLED");
  expect(
    await db.deviceCredential.count({
      where: { deviceId: f.device.id, status: "ACTIVE" },
    }),
  ).toBe(0);
});

async function rejectAudit(run: () => Promise<void>) {
  await db.$executeRawUnsafe(
    `CREATE FUNCTION reject_phase_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit rejection'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER reject_phase_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_phase_audit()`,
  );
  try {
    await run();
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER reject_phase_audit ON "AuditEvent"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION reject_phase_audit()");
  }
}
it("rolls back lifecycle, credential and polling changes if audit fails", async () => {
  const f = await fixture();
  await credentials.issueDeviceToken(admin, { deviceId: f.device.id });
  await rejectAudit(async () => {
    await expect(
      management.changeDeviceLifecycle(f.device.id, "DECOMMISSIONED"),
    ).rejects.toThrow();
  });
  expect(
    (await db.device.findUniqueOrThrow({ where: { id: f.device.id } }))
      .lifecycleStatus,
  ).toBe("ACTIVE");
  expect(
    await db.deviceCredential.count({
      where: { deviceId: f.device.id, status: "ACTIVE" },
    }),
  ).toBe(1);
  expect(
    (
      await db.modbusConfiguration.findUniqueOrThrow({
        where: { deviceId: f.device.id },
      })
    ).pollingEnabled,
  ).toBe(true);
});
it("audits token issuance, rotation and revocation without secrets", async () => {
  const f = await fixture();
  const first = await credentials.issueDeviceToken(admin, {
    deviceId: f.device.id,
  });
  const second = await credentials.issueDeviceToken(admin, {
    deviceId: f.device.id,
  });
  const active = await db.deviceCredential.findFirstOrThrow({
    where: { deviceId: f.device.id, status: "ACTIVE" },
  });
  await credentials.revokeDeviceToken(admin, active.id);
  const rows = await db.auditEvent.findMany({
    where: { details: { path: ["deviceId"], equals: f.device.id } },
    orderBy: { createdAt: "asc" },
  });
  expect(rows.map((r) => r.action)).toEqual([
    "device.credential.issue",
    "device.credential.rotate",
    "device.credential.revoke",
  ]);
  const text = JSON.stringify(rows);
  expect(
    [
      first.token,
      second.token,
      active.tokenHash,
      "tokenHash",
      "privateKey",
    ].some((secret) => text.includes(secret)),
  ).toBe(false);
});
it("failed token mutation has no success audit and audit failure rolls back tokens", async () => {
  const f = await fixture();
  await rejectAudit(async () => {
    await expect(
      credentials.issueDeviceToken(admin, { deviceId: f.device.id }),
    ).rejects.toThrow();
  });
  expect(
    await db.deviceCredential.count({ where: { deviceId: f.device.id } }),
  ).toBe(0);
  const issued = await credentials.issueDeviceToken(admin, {
    deviceId: f.device.id,
  });
  const tokenRow = await db.deviceCredential.findFirstOrThrow({
    where: { deviceId: f.device.id },
  });
  await rejectAudit(async () => {
    await expect(
      credentials.revokeDeviceToken(admin, tokenRow.id),
    ).rejects.toThrow();
  });
  expect(
    (
      await db.deviceCredential.findUniqueOrThrow({
        where: { id: tokenRow.id },
      })
    ).status,
  ).toBe("ACTIVE");
  expect(
    await db.auditEvent.count({
      where: { entityId: tokenRow.id, action: "device.credential.revoke" },
    }),
  ).toBe(0);
  expect(
    (await credentials.authenticateDevice(`Bearer ${issued.token}`)).device.id,
  ).toBe(f.device.id);
});
it("foreign token operations fail without audit", async () => {
  const count = await db.auditEvent.count();
  await expect(
    credentials.issueDeviceToken(admin, { deviceId: foreign.device.id }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    credentials.revokeDeviceToken(admin, "missing"),
  ).rejects.toMatchObject({ status: 404 });
  expect(await db.auditEvent.count()).toBe(count);
});
it("serializes concurrent issuance so only one token remains active", async () => {
  const f = await fixture();
  await Promise.all([
    credentials.issueDeviceToken(admin, { deviceId: f.device.id }),
    credentials.issueDeviceToken(admin, { deviceId: f.device.id }),
  ]);
  expect(
    await db.deviceCredential.count({
      where: { deviceId: f.device.id, status: "ACTIVE" },
    }),
  ).toBe(1);
});

it("ASSIGN_PROFILE needs no status and does not transition lifecycle", async () => {
  const f = await fixture();
  const profile = await db.deviceProfile.create({
    data: {
      tenantId: admin.tenantId!,
      manufacturer: "Test",
      model: "Test",
      utility: "ELECTRICITY",
      protocol: "MODBUS_TCP",
      version: 1,
      capabilities: [],
      mapping: {},
    },
  });
  await management.bulkDeviceAction({
    ids: [f.device.id],
    action: "ASSIGN_PROFILE",
    profileId: profile.id,
  });
  const result = await db.device.findUniqueOrThrow({
    where: { id: f.device.id },
  });
  expect(result.profileId).toBe(profile.id);
  expect(result.lifecycleStatus).toBe("ACTIVE");
  await management.bulkDeviceAction({
    ids: [f.device.id],
    action: "ASSIGN_PROFILE",
    profileId: profile.id,
    status: "NEW",
  });
  expect(
    (await db.device.findUniqueOrThrow({ where: { id: f.device.id } }))
      .lifecycleStatus,
  ).toBe("ACTIVE");
});
it("rejects missing or foreign profile and mixed-tenant bulk IDs atomically", async () => {
  const profile = await db.deviceProfile.create({
    data: {
      tenantId: "phase-foreign",
      manufacturer: "Foreign",
      model: "Test",
      utility: "ELECTRICITY",
      protocol: "MODBUS_TCP",
      version: 1,
      capabilities: [],
      mapping: {},
    },
  });
  await expect(
    management.bulkDeviceAction({
      ids: [own.device.id],
      action: "ASSIGN_PROFILE",
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    management.bulkDeviceAction({
      ids: [own.device.id],
      action: "ASSIGN_PROFILE",
      profileId: profile.id,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    management.bulkDeviceAction({
      ids: [own.device.id, foreign.device.id],
      action: "SET_STATUS",
      status: "DECOMMISSIONED",
    }),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await db.device.findUniqueOrThrow({ where: { id: own.device.id } }))
      .lifecycleStatus,
  ).toBe("ACTIVE");
});

it.each([
  "unfinished",
  "unreviewed",
  "wrong-revision",
  "unassigned",
  "wrong-unit",
  "decommissioned",
  "disabled",
  "unverified",
  "missing-config",
])("denies START for %s", async (kind) => {
  const f = await fixture();
  if (kind === "unfinished")
    await db.modbusConfiguration.update({
      where: { deviceId: f.device.id },
      data: { completedAt: null },
    });
  if (kind === "unreviewed" || kind === "wrong-revision")
    await db.modbusConfiguration.update({
      where: { deviceId: f.device.id },
      data: { reviewedRevision: kind === "unreviewed" ? null : 2 },
    });
  if (kind === "unassigned" || kind === "wrong-unit")
    await db.modbusConfiguration.update({
      where: { deviceId: f.device.id },
      data: { confirmedUnitId: kind === "unassigned" ? null : hidden.unit.id },
    });
  if (kind === "decommissioned")
    await db.device.update({
      where: { id: f.device.id },
      data: { lifecycleStatus: "DECOMMISSIONED" },
    });
  if (kind === "disabled")
    await db.device.update({
      where: { id: f.device.id },
      data: { status: "DISABLED" },
    });
  if (kind === "unverified")
    await db.modbusConfiguration.update({
      where: { deviceId: f.device.id },
      data: { configuration: { ...defaultConfig, profileId: profiles[1].id } },
    });
  if (kind === "missing-config")
    await db.modbusConfiguration.delete({ where: { deviceId: f.device.id } });
  await expect(
    modbus.writeModbus(f.meter.id, { operation: "COMMAND", action: "START" }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.gatewayCommand.count({ where: { deviceId: f.device.id } }),
  ).toBe(0);
});
it("permits START only after complete commissioning", async () => {
  const f = await fixture();
  const result = await modbus.writeModbus(f.meter.id, {
    operation: "COMMAND",
    action: "START",
  });
  expect(result).toHaveProperty("commandId");
  expect(
    await db.gatewayCommand.count({
      where: { deviceId: f.device.id, action: "START", status: "PENDING" },
    }),
  ).toBe(1);
});
it("does not reactivate a decommissioned device through reconfiguration or stale REST ingestion", async () => {
  const f = await fixture();
  const stale = { ...f.device, meter: { measurementUnit: "kWh" } };
  await management.changeDeviceLifecycle(f.device.id, "DECOMMISSIONED");
  await expect(
    modbus.writeModbus(f.meter.id, {
      operation: "CONFIGURE",
      gatewayId: f.gateway.id,
      configuration: defaultConfig,
    }),
  ).rejects.toMatchObject({ status: 409 });
  const { ingestReading } = await import("../src/server/ingestion");
  await expect(
    ingestReading(stale, {
      messageId: "00000000-0000-4000-8000-000000000001",
      timestamp: new Date().toISOString(),
      value: 1,
      unit: "kWh",
    }),
  ).rejects.toMatchObject({ status: 403 });
  const { acceptTelemetry } = await import("../src/server/modbus-ingestion");
  await expect(
    db.$transaction((tx) =>
      acceptTelemetry(tx, admin.tenantId!, f.gateway.id, {
        kind: "telemetry",
        messageId: "00000000-0000-4000-8000-000000000001",
        deviceId: f.device.id,
        revision: 1,
        timestamp: new Date().toISOString(),
        responseMs: 0,
        error: "TIMEOUT",
        values: [],
      }),
    ),
  ).rejects.toThrow("Decommissioned");
  expect(await db.reading.count({ where: { deviceId: f.device.id } })).toBe(0);
});

it("lists system-wide gateways and paginates with tenant and status filters", async () => {
  actor = { ...admin, role: "SUPER_ADMIN", tenantId: null };
  const all = await adminUi.listAdminGateways({ page: 1 });
  expect(all.total).toBeGreaterThanOrEqual(3);
  expect(all.items.map((g) => g.tenantId)).toContain("phase-foreign");
  const ownOnly = await adminUi.listAdminGateways({
    tenantId: admin.tenantId,
    status: "ONLINE",
    page: 1,
  });
  expect(
    ownOnly.items.every(
      (g) => g.tenantId === admin.tenantId && g.status === "ONLINE",
    ),
  ).toBe(true);
  const byExternalId = await adminUi.listAdminGateways({
    q: own.gateway.externalGatewayId,
  });
  expect(byExternalId.items.map((g) => g.id)).toContain(own.gateway.id);
  await expect(
    adminUi.listAdminGateways({ tenantId: "missing-tenant" }),
  ).rejects.toMatchObject({ status: 404 });
});

it("provides a safe gateway detail DTO with devices, property, health, credential metadata, alerts and audit", async () => {
  actor = { ...admin, role: "SUPER_ADMIN", tenantId: null };
  const keyPair = generateKeyPairSync("ed25519");
  const publicKey = keyPair.publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  const issued = await gatewayCredentials.registerGatewayPublicKey(
    own.gateway.id,
    { publicKey },
    admin.tenantId,
  );
  const result = await adminUi.getAdminGateway(own.gateway.id, admin.tenantId!);
  expect(result.gateway.tenant).toMatchObject({ id: admin.tenantId });
  expect(result.gateway.devices.map((d) => d.id)).toContain(own.device.id);
  expect(result.health).toHaveProperty("status");
  expect(result.credentials[0]).toHaveProperty("keyFingerprint");
  expect(result.audit.some((e) => e.entityId === issued.id)).toBe(true);
  const renderedData = JSON.stringify(result);
  expect(renderedData.includes("PRIVATE KEY")).toBe(false);
  expect(renderedData.includes("publicKey")).toBe(false);
  expect(renderedData.includes("tokenHash")).toBe(false);
  await expect(
    adminUi.getAdminGateway(own.gateway.id, "phase-foreign"),
  ).rejects.toMatchObject({ status: 404 });
});

it("lists cross-tenant devices with safe fields and rejects a fabricated tenant", async () => {
  actor = { ...admin, role: "SUPER_ADMIN", tenantId: null };
  const result = await adminUi.listAdminDevices({ page: 1 });
  expect(result.total).toBeGreaterThanOrEqual(3);
  expect(result.items.map((d) => d.tenantId)).toContain("phase-foreign");
  expect(JSON.stringify(result.items[0])).not.toContain("tokenHash");
  const scoped = await adminUi.listAdminDevices({ tenantId: "phase-foreign" });
  expect(scoped.items.every((d) => d.tenantId === "phase-foreign")).toBe(true);
  await expect(
    adminUi.listAdminDevices({ tenantId: "missing-tenant" }),
  ).rejects.toMatchObject({ status: 404 });
});

it.each(["TENANT_ADMIN", "MANAGER", "USER"] as const)(
  "blocks %s from every central server entry point",
  async (role) => {
    actor = { ...admin, role };
    await expect(adminUi.listAdminGateways()).rejects.toMatchObject({
      status: 403,
    });
    await expect(adminUi.listAdminDevices()).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      adminUi.getAdminGateway(own.gateway.id, admin.tenantId!),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      adminUi.prepareAdminGateway(admin.tenantId!, {
        name: "Blocked",
        externalGatewayId: `blocked-${role}`,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      adminUi.adminGatewayCredential(own.gateway.id, {
        tenantId: admin.tenantId,
        operation: "CREATE",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      adminUi.decommissionAdminDevice(own.device.id, {
        tenantId: admin.tenantId,
        status: "DECOMMISSIONED",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  },
);

it("prepares a gateway through existing quota and audit service and rejects tenant manipulation", async () => {
  actor = { ...admin, role: "SUPER_ADMIN", tenantId: null };
  const created = await adminUi.prepareAdminGateway(admin.tenantId!, {
    name: "Synthetic admin gateway",
    externalGatewayId: `admin-${serial}`,
    propertyId: own.property.id,
  });
  expect(created.name).toBe("Synthetic admin gateway");
  expect(
    await db.auditEvent.count({
      where: {
        entityId: created.id,
        action: "gateway.created",
        tenantId: admin.tenantId,
      },
    }),
  ).toBe(1);
  await expect(
    adminUi.prepareAdminGateway("missing-tenant", {
      name: "Invalid",
      externalGatewayId: `missing-${serial}`,
      propertyId: own.property.id,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    adminUi.prepareAdminGateway(admin.tenantId!, {
      name: "Invalid field",
      externalGatewayId: "bad/id",
      propertyId: own.property.id,
    }),
  ).rejects.toBeDefined();
});

it("registers public keys and revokes credentials without private-key response or audit data", async () => {
  actor = { ...admin, role: "SUPER_ADMIN", tenantId: null };
  const firstKeys = generateKeyPairSync("ed25519");
  const first = await gatewayCredentials.registerGatewayPublicKey(
    own.gateway.id,
    {
      publicKey: firstKeys.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    },
    admin.tenantId,
  );
  await adminUi.adminGatewayCredential(own.gateway.id, {
    tenantId: admin.tenantId,
    operation: "REVOKE",
    credentialId: first.id,
    confirmed: true,
  });
  const secondKeys = generateKeyPairSync("ed25519");
  const second = await gatewayCredentials.registerGatewayPublicKey(
    own.gateway.id,
    {
      publicKey: secondKeys.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    },
    admin.tenantId,
  );
  await adminUi.adminGatewayCredential(own.gateway.id, {
    tenantId: admin.tenantId,
    operation: "REVOKE",
    credentialId: second.id,
    confirmed: true,
  });
  const events = await db.auditEvent.findMany({
    where: {
      tenantId: admin.tenantId,
      entityId: { in: [first.id, second.id] },
    },
  });
  expect(events.map((e) => e.action)).toEqual(
    expect.arrayContaining([
      "gateway.credential.register",
      "gateway.credential.revoke",
    ]),
  );
  expect(JSON.stringify(events)).not.toContain("PRIVATE KEY");
  const metadata = await adminUi.getAdminGateway(
    own.gateway.id,
    admin.tenantId!,
  );
  expect(JSON.stringify(metadata.credentials)).not.toContain("privateKey");
  await expect(
    adminUi.adminGatewayCredential(own.gateway.id, {
      tenantId: "phase-foreign",
      operation: "REVOKE",
      credentialId: first.id,
      confirmed: true,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    adminUi.adminGatewayCredential(own.gateway.id, {
      tenantId: admin.tenantId,
      operation: "ROTATE",
      credentialId: first.id,
      confirmed: true,
    }),
  ).rejects.toBeDefined();
});
it("routes central decommissioning through the Phase 1A transition and tenant checks", async () => {
  actor = { ...admin, role: "SUPER_ADMIN", tenantId: null };
  await expect(
    adminUi.decommissionAdminDevice(foreign.device.id, {
      tenantId: admin.tenantId,
      status: "DECOMMISSIONED",
      confirmed: true,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    adminUi.decommissionAdminDevice(own.device.id, {
      tenantId: admin.tenantId,
      status: "DECOMMISSIONED",
      confirmed: false,
    }),
  ).rejects.toBeDefined();
  await adminUi.decommissionAdminDevice(own.device.id, {
    tenantId: admin.tenantId,
    status: "DECOMMISSIONED",
    confirmed: true,
  });
  await expect(
    adminUi.decommissionAdminDevice(own.device.id, {
      tenantId: admin.tenantId,
      status: "DECOMMISSIONED",
      confirmed: true,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.deviceCredential.count({
      where: { deviceId: own.device.id, status: "ACTIVE" },
    }),
  ).toBe(0);
});
