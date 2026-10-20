import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  cpSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Client } from "pg";
import type { Actor } from "../src/server/policy";
import { signedMessage } from "../apps/edge-gateway/src/wire";
import { defaultConfig, profiles } from "../src/lib/modbus/contracts";

vi.mock("@/server/db", () => ({ db }));
vi.mock("@/server/auth", () => ({ requireActor: async () => actor }));
vi.mock("@/server/licensing", () => ({ requireTenantQuota: vi.fn() }));
vi.mock("@/server/webhooks", () => ({ enqueueWebhookEvent: vi.fn() }));

mkdirSync(".local", { recursive: true });
const directory = mkdtempSync(resolve(".local/gateway-provisioning-test-"));
const port = 55454;
const url = `postgresql://phase1c@127.0.0.1:${port}/phase1c`;
const postgres = new EmbeddedPostgres({
  databaseDir: resolve(directory, "pg"),
  user: "phase1c",
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
const admin: Actor = {
  id: "platform",
  tenantId: null,
  role: "SUPER_ADMIN",
  name: "Test",
  email: "test@example.invalid",
};
let actor: Actor = admin;
let service: typeof import("../src/server/gateway-lifecycle");
let credentials: typeof import("../src/server/gateway-credentials");
let identity: typeof import("../src/server/gateway-communication-identity");
let ingestion: typeof import("../src/server/gateway-ingestion");
let management: typeof import("../src/server/device-management");
let assignment: typeof import("../src/server/gateway-assignment");
let search: typeof import("../src/server/global-search");
let imports: typeof import("../src/server/data-imports");
let modbus: typeof import("../src/server/modbus");
let crud: typeof import("../src/server/crud");
let p1: Awaited<ReturnType<typeof property>>;
let p2: Awaited<ReturnType<typeof property>>;
let foreign: Awaited<ReturnType<typeof property>>;
let upgradeRows: Record<string, unknown>[];
let upgradeDeviceCount: number;
let started = false;
const migration = "202610190001_gateway_provisioning_foundation";

function deploy(databaseUrl: string, config?: string) {
  execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      ...(config ? ["--config", config] : []),
    ],
    {
      windowsHide: true,
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        METERWERK_ENV: "test",
        DOTENV_CONFIG_PATH: resolve(directory, "absent.env"),
      },
    },
  );
}
async function property(tenantId: string) {
  const p = await db.property.create({
    data: { tenantId, name: "Test", address: "Test", city: "Test" },
  });
  const building = await db.building.create({
    data: { tenantId, propertyId: p.id, name: "Test" },
  });
  const unit = await db.unit.create({
    data: {
      tenantId,
      buildingId: building.id,
      name: "Test",
      floor: "0",
      area: "1",
    },
  });
  const meter = await db.meter.create({
    data: {
      tenantId,
      unitId: unit.id,
      serialNumber: randomUUID(),
      type: "ELECTRICITY",
      manufacturer: "Test",
      model: "Test",
      measurementUnit: "kWh",
      location: "Test",
      installedAt: new Date(),
      demoPricePerUnit: "0",
    },
  });
  return { ...p, building, unit, meter };
}
async function gateway(
  status: (typeof service.gatewayLifecycles)[number] = "NEW",
  propertyId: string | null = p1.id,
) {
  return db.gateway.create({
    data: {
      tenantId: "own",
      propertyId,
      name: "gw-search",
      externalGatewayId: `gw-search-${randomUUID()}`,
      manufacturer: "Test",
      model: "Test",
      status: "OFFLINE",
      lifecycleStatus: status,
    },
  });
}
const deviceInput = (meterId: string, gatewayId?: string) => ({
  name: "Test",
  externalDeviceId: randomUUID(),
  manufacturer: "Test",
  model: "Test",
  protocol: "MODBUS",
  meterId,
  ...(gatewayId ? { gatewayId } : {}),
});
async function device(gatewayId: string, meterId = p1.meter.id) {
  return db.device.create({
    data: {
      ...deviceInput(meterId, gatewayId),
      tenantId: "own",
      protocol: "MODBUS",
      installedAt: new Date(),
      lifecycleStatus: "ACTIVE",
      status: "ONLINE",
    },
  });
}
function metadata() {
  return {
    brokerReference: "test-broker",
    issuerReference: "test-ca",
    certificateFingerprint: randomUUID().replaceAll("-", "").repeat(2),
    serialNumber: "01",
    notBefore: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
}
async function signedHeartbeat(gatewayId: string) {
  const keys = generateKeyPairSync("ed25519");
  const credential = await db.gatewayCredential.create({
    data: {
      id: randomUUID(),
      tenantId: "own",
      gatewayId,
      publicKey: keys.publicKey
        .export({ format: "pem", type: "spki" })
        .toString(),
    },
  });
  const topic = `meterwerk/v1/gateways/${gatewayId}/heartbeat`;
  const payload = Buffer.from(
    signedMessage(
      topic,
      credential.id,
      {
        gatewayId,
        timestamp: new Date().toISOString(),
        agentVersion: "test",
        uptime: 0,
        connectedDevices: 0,
        queueSize: 0,
      },
      keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    ),
  );
  return { topic, payload, credential };
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
      resolve(directory, "pg"),
      "-U",
      "phase1c",
      "--auth=trust",
      "--encoding=UTF8",
      "--locale=C",
    ],
    { stdio: "pipe", windowsHide: true },
  );
  await postgres.start();
  started = true;
  await postgres.createDatabase("phase1c");
  await postgres.createDatabase("phase1c_upgrade");
  deploy(url);
  // Real upgrade: apply all existing Phase-1B migrations first, populate old
  // columns (including an ambiguous gateway), then apply the new migration.
  const staged = resolve(directory, "baseline");
  mkdirSync(staged);
  for (const entry of readdirSync("prisma/migrations"))
    if (entry !== migration)
      cpSync(resolve("prisma/migrations", entry), resolve(staged, entry), {
        recursive: true,
      });
  const config = resolve(directory, "baseline.config.ts");
  writeFileSync(
    config,
    `import { defineConfig } from "prisma/config"; export default defineConfig({ schema: ${JSON.stringify(resolve("prisma/schema.prisma"))}, migrations: {path: ${JSON.stringify(staged)}}, datasource: {url: process.env.DATABASE_URL!} });`,
  );
  const upgradeUrl = url.replace(/phase1c$/, "phase1c_upgrade");
  deploy(upgradeUrl, config);
  const old = new Client({ connectionString: upgradeUrl });
  await old.connect();
  try {
    await old.query(`INSERT INTO "Tenant" (id,name,slug) VALUES ('legacy','legacy','legacy');
      INSERT INTO "Property" (id,"tenantId",name,address,city) VALUES ('a','legacy','a','a','a'),('b','legacy','b','b','b');
      INSERT INTO "Building" (id,"tenantId","propertyId",name) VALUES ('a','legacy','a','a'),('b','legacy','b','b');
      INSERT INTO "Unit" (id,"tenantId","buildingId",name,floor,area) VALUES ('a','legacy','a','a','0',1),('b','legacy','b','b','0',1);
      INSERT INTO "Meter" (id,"tenantId","unitId","serialNumber",type,manufacturer,model,"measurementUnit",location,"installedAt","demoPricePerUnit") VALUES ('a','legacy','a','a','ELECTRICITY','t','t','kWh','t','2020-01-01',0),('b','legacy','b','b','ELECTRICITY','t','t','kWh','t','2020-01-01',0);
      INSERT INTO "Gateway" (id,"tenantId",name,"externalGatewayId",manufacturer,model,status,"installedAt","updatedAt") VALUES ('ambiguous','legacy','t','ambiguous','t','t','ONLINE','2020-01-01',now()),('empty','legacy','t','empty','t','t','OFFLINE','2020-01-01',now());
      INSERT INTO "Device" (id,"tenantId","meterId","gatewayId","externalDeviceId",manufacturer,model,protocol,"installedAt","updatedAt") VALUES ('a','legacy','a','ambiguous','a','t','t','MODBUS','2020-01-01',now()),('b','legacy','b','ambiguous','b','t','t','MODBUS','2020-01-01',now());`);
    deploy(upgradeUrl);
    upgradeRows = (
      await old.query(
        'SELECT id,status,"propertyId","lifecycleStatus","installedAt"::text AS "installedAt","commissionedAt",revision FROM "Gateway" ORDER BY id',
      )
    ).rows;
    upgradeDeviceCount = Number(
      (
        await old.query(
          'SELECT count(*) FROM "Device" WHERE "gatewayId"=\'ambiguous\'',
        )
      ).rows[0].count,
    );
  } finally {
    await old.end();
  }
  service = await import("../src/server/gateway-lifecycle");
  credentials = await import("../src/server/gateway-credentials");
  identity = await import("../src/server/gateway-communication-identity");
  ingestion = await import("../src/server/gateway-ingestion");
  management = await import("../src/server/device-management");
  assignment = await import("../src/server/gateway-assignment");
  search = await import("../src/server/global-search");
  imports = await import("../src/server/data-imports");
  modbus = await import("../src/server/modbus");
  crud = await import("../src/server/crud");
  for (const id of ["own", "foreign"])
    await db.tenant.create({ data: { id, name: id, slug: id } });
  p1 = await property("own");
  p2 = await property("own");
  foreign = await property("foreign");
  await db.user.create({
    data: {
      id: "reader",
      tenantId: "own",
      name: "Reader",
      email: "reader@example.invalid",
      role: "USER",
      passwordHash: "unused-test-fixture",
    },
  });
  await db.propertyGrant.create({
    data: { userId: "reader", tenantId: "own", propertyId: p1.id },
  });
}, 120000);
beforeEach(() => {
  actor = admin;
});
afterAll(async () => {
  await db.$disconnect();
  if (started) await postgres.stop();
});

it("fresh migration has all new fields and defaults without an installation claim", async () => {
  const g = await gateway();
  expect(g).toMatchObject({
    lifecycleStatus: "NEW",
    revision: 0,
    installedAt: null,
    commissionedAt: null,
    firstContactAt: null,
  });
  expect(
    await db.$queryRaw`SELECT "migration_name" FROM "_prisma_migrations" WHERE "migration_name"=${migration} AND "finished_at" IS NOT NULL`,
  ).toHaveLength(1);
});
it("upgrades Phase-1B data without interpreting ONLINE or repairing ambiguous properties", () => {
  expect(upgradeRows).toHaveLength(2);
  for (const row of upgradeRows)
    expect(row).toMatchObject({
      propertyId: null,
      lifecycleStatus: "NEW",
      revision: 0,
      commissionedAt: null,
      installedAt: "2020-01-01 00:00:00",
    });
  expect(upgradeRows[0].status).toBe("ONLINE");
  expect(upgradeDeviceCount).toBe(2);
});
const states = [
  "NEW",
  "PROVISIONING",
  "ACTIVE",
  "MAINTENANCE",
  "FAILED",
  "DECOMMISSIONED",
] as const;
const allowed = new Set([
  "NEW:PROVISIONING",
  "NEW:DECOMMISSIONED",
  "PROVISIONING:ACTIVE",
  "PROVISIONING:FAILED",
  "PROVISIONING:DECOMMISSIONED",
  "ACTIVE:MAINTENANCE",
  "ACTIVE:DECOMMISSIONED",
  "MAINTENANCE:ACTIVE",
  "MAINTENANCE:PROVISIONING",
  "MAINTENANCE:FAILED",
  "MAINTENANCE:DECOMMISSIONED",
  "FAILED:PROVISIONING",
  "FAILED:DECOMMISSIONED",
]);
it.each(states.flatMap((from) => states.map((to) => [from, to] as const)))(
  "transition %s -> %s honors policy and activation gate",
  async (from, to) => {
    const g = await gateway(from);
    expect(service.isAllowedGatewayTransition(from, to)).toBe(
      allowed.has(`${from}:${to}`),
    );
    const run = service.changeGatewayLifecycle(
      g.id,
      {
        status: to,
        revision: 0,
        ...(to === "FAILED" ? { errorCode: "CONFIGURATION_FAILED" } : {}),
      },
      "own",
    );
    if (from === to) {
      expect(await run).toMatchObject({ revision: 0, lifecycleStatus: from });
      return;
    }
    if (!allowed.has(`${from}:${to}`) || to === "ACTIVE")
      await expect(run).rejects.toMatchObject({ status: 409 });
    else expect(await run).toMatchObject({ revision: 1, lifecycleStatus: to });
  },
);
it.each(["USER", "MANAGER", "TENANT_ADMIN"] as const)(
  "%s cannot provision, assign or change identities",
  async (role) => {
    actor = { ...admin, role, tenantId: "own" };
    const g = await gateway();
    for (const run of [
      () =>
        service.changeGatewayLifecycle(g.id, {
          status: "PROVISIONING",
          revision: 0,
        }),
      () =>
        service.assignGatewayProperty(g.id, { propertyId: p2.id, revision: 0 }),
      () =>
        credentials.createPilotGateway({ name: "x", externalGatewayId: "x" }),
      () => credentials.manageGatewayCredential(g.id, { operation: "CREATE" }),
      () => identity.registerGatewayCommunicationIdentity(g.id, metadata()),
    ])
      await expect(run()).rejects.toMatchObject({ status: 403 });
  },
);
it("requires explicit tenant and rejects foreign IDs, stale revision and injected fields", async () => {
  const g = await gateway();
  await expect(
    service.changeGatewayLifecycle(g.id, {
      status: "PROVISIONING",
      revision: 0,
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    service.changeGatewayLifecycle(
      g.id,
      { status: "PROVISIONING", revision: 0 },
      "foreign",
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service.changeGatewayLifecycle(
      g.id,
      { status: "PROVISIONING", revision: 5 },
      "own",
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    service.changeGatewayLifecycle(
      g.id,
      { status: "PROVISIONING", revision: 0, tenantId: "foreign" },
      "own",
    ),
  ).rejects.toBeDefined();
});
it("serializes competing lifecycle changes using revision", async () => {
  const g = await gateway("PROVISIONING");
  const results = await Promise.allSettled([
    service.changeGatewayLifecycle(
      g.id,
      { status: "FAILED", errorCode: "OPERATOR_ABORTED", revision: 0 },
      "own",
    ),
    service.changeGatewayLifecycle(
      g.id,
      { status: "DECOMMISSIONED", revision: 0 },
      "own",
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("heartbeat records first contact without activation; offline detection preserves lifecycle", async () => {
  const g = await gateway("PROVISIONING");
  const message = await signedHeartbeat(g.id);
  await ingestion.ingestGatewayMessage(message.topic, message.payload);
  const online = await db.gateway.findUniqueOrThrow({ where: { id: g.id } });
  expect(online.lifecycleStatus).toBe("PROVISIONING");
  expect(online.firstContactAt).toBeInstanceOf(Date);
  expect(online.status).toBe("ONLINE");
  await ingestion.ingestGatewayMessage(message.topic, message.payload);
  expect(
    (await db.gateway.findUniqueOrThrow({ where: { id: g.id } }))
      .firstContactAt,
  ).toEqual(online.firstContactAt);
  await db.gateway.update({
    where: { id: g.id },
    data: { lastSeenAt: new Date(Date.now() - 60000) },
  });
  await ingestion.detectOffline();
  expect(
    await db.gateway.findUniqueOrThrow({ where: { id: g.id } }),
  ).toMatchObject({ status: "OFFLINE", lifecycleStatus: "PROVISIONING" });
});
it("accepts same-property device assignment and preserves tenant-admin device rights", async () => {
  actor = { ...admin, role: "TENANT_ADMIN", tenantId: "own" };
  const g = await gateway();
  expect(
    await management.createDevice(deviceInput(p1.meter.id, g.id)),
  ).toMatchObject({ gatewayId: g.id });
});
it.each(["other-property", "foreign-tenant", "legacy-null"])(
  "rejects new assignment: %s",
  async (kind) => {
    const g = await gateway("NEW", kind === "legacy-null" ? null : p1.id);
    const meter =
      kind === "other-property"
        ? p2.meter
        : kind === "foreign-tenant"
          ? foreign.meter
          : p1.meter;
    await expect(
      management.createDevice(deviceInput(meter.id, g.id), "own"),
    ).rejects.toBeDefined();
  },
);
it("legacy NULL keeps identical assignments but forbids changed gateway/meter links", async () => {
  const g = await gateway("NEW", null),
    d = await device(g.id);
  await expect(
    management.updateDevice(d.id, { name: "Renamed" }, "own"),
  ).resolves.toMatchObject({ name: "Renamed" });
  await expect(
    management.updateDevice(
      d.id,
      { gatewayId: g.id, meterId: d.meterId },
      "own",
    ),
  ).resolves.toBeDefined();
  await expect(
    management.updateDevice(d.id, { meterId: p2.meter.id }, "own"),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    service.changeGatewayLifecycle(
      g.id,
      { status: "PROVISIONING", revision: 0 },
      "own",
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("rejects device reassignment to another property without moving any hierarchy", async () => {
  const a = await gateway(),
    b = await gateway("NEW", p2.id),
    d = await device(a.id);
  await expect(
    management.updateDevice(d.id, { gatewayId: b.id }, "own"),
  ).rejects.toMatchObject({ status: 409 });
  expect(await db.device.findUnique({ where: { id: d.id } })).toMatchObject({
    gatewayId: a.id,
    meterId: p1.meter.id,
  });
});
it("explicitly binds a consistent legacy gateway but rejects ambiguous descendants", async () => {
  const g = await gateway("NEW", null);
  await device(g.id);
  expect(
    await service.assignGatewayProperty(
      g.id,
      { propertyId: p1.id, revision: 0 },
      "own",
    ),
  ).toMatchObject({ propertyId: p1.id, revision: 1 });
  const ambiguous = await gateway("NEW", null);
  await device(ambiguous.id);
  await device(ambiguous.id, p2.meter.id);
  await expect(
    service.assignGatewayProperty(
      ambiguous.id,
      { propertyId: p1.id, revision: 0 },
      "own",
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await db.gateway.findUniqueOrThrow({ where: { id: ambiguous.id } }))
      .propertyId,
  ).toBeNull();
});
it("rejects cross-tenant property in both service and database FK", async () => {
  const g = await gateway();
  await expect(
    service.assignGatewayProperty(
      g.id,
      { propertyId: foreign.id, revision: 0 },
      "own",
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    db.gateway.update({
      where: { id: g.id },
      data: { propertyId: foreign.id },
    }),
  ).rejects.toBeDefined();
});
it("serializes assignment with property change", async () => {
  const g = await gateway();
  const results = await Promise.allSettled([
    management.createDevice(deviceInput(p1.meter.id, g.id), "own"),
    service.assignGatewayProperty(
      g.id,
      { propertyId: p2.id, revision: 0 },
      "own",
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("blocks hierarchy changes with gateway descendants", async () => {
  const g = await gateway();
  await device(g.id);
  await expect(
    crud.writeResource(
      { ...admin, tenantId: "own", role: "TENANT_ADMIN" },
      "buildings",
      "update",
      { id: p1.building.id, name: "Moved", propertyId: p2.id },
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    db.$transaction((tx) =>
      assignment.assertNoGatewayHierarchyMove(tx, "own", { id: p1.meter.id }),
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await db.building.findUniqueOrThrow({ where: { id: p1.building.id } }))
      .propertyId,
  ).toBe(p1.id);
});
it("Modbus CONFIGURE cannot bypass the property invariant", async () => {
  const local = await property("own"),
    g = await gateway();
  await expect(
    modbus.writeModbus(
      local.meter.id,
      { operation: "CONFIGURE", gatewayId: g.id, configuration: defaultConfig },
      "own",
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it.each(["gateways", "devices"])(
  "blocks unsafe %s import at confirmation",
  async (resource) => {
    const batch = await db.dataImport.create({
      data: {
        tenantId: "own",
        actorId: admin.id,
        resource,
        fingerprint: randomUUID(),
        stagedData: [{ gatewayId: "some-gateway" }],
        errors: [],
        rowCount: 1,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await expect(
      imports.confirmCsvImport(admin, batch.id, "own"),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await db.dataImport.findUniqueOrThrow({ where: { id: batch.id } }))
        .status,
    ).toBe("PREVIEWED");
  },
);
it("new gateway preparation has no installation claim and validates optional property", async () => {
  const g = await credentials.createPilotGateway(
    { name: "Prepared", externalGatewayId: randomUUID(), propertyId: p1.id },
    "own",
  );
  expect(await db.gateway.findUnique({ where: { id: g.id } })).toMatchObject({
    installedAt: null,
    lifecycleStatus: "NEW",
    propertyId: p1.id,
  });
  await expect(
    credentials.createPilotGateway(
      {
        name: "Wrong",
        externalGatewayId: randomUUID(),
        propertyId: foreign.id,
      },
      "own",
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("decommission revokes signatures, cancels open commands, blocks ingestion and preserves devices", async () => {
  const g = await gateway("ACTIVE"),
    d = await device(g.id),
    message = await signedHeartbeat(g.id);
  const ident = await identity.registerGatewayCommunicationIdentity(
    g.id,
    metadata(),
    "own",
  );
  await db.modbusConfiguration.create({
    data: {
      tenantId: "own",
      deviceId: d.id,
      configuration: defaultConfig,
      profile: profiles[0],
      pollingEnabled: true,
      state: "ACTIVE",
    },
  });
  for (const status of [
    "PENDING",
    "QUEUED",
    "SENT",
    "ACKNOWLEDGED",
    "SUCCEEDED",
  ])
    await db.gatewayCommand.create({
      data: {
        tenantId: "own",
        gatewayId: g.id,
        deviceId: d.id,
        action: "READ",
        revision: 1,
        status,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
  await service.changeGatewayLifecycle(
    g.id,
    { status: "DECOMMISSIONED", revision: 0 },
    "own",
  );
  expect(
    await db.gatewayCredential.findUnique({
      where: { id: message.credential.id },
    }),
  ).toMatchObject({ status: "REVOKED" });
  expect(
    await db.gatewayCommand.count({
      where: { gatewayId: g.id, status: "CANCELLED" },
    }),
  ).toBe(4);
  expect(
    await db.gatewayCommand.count({
      where: { gatewayId: g.id, status: "SUCCEEDED" },
    }),
  ).toBe(1);
  expect(await db.device.findUnique({ where: { id: d.id } })).toMatchObject({
    lifecycleStatus: "ACTIVE",
  });
  expect(
    await db.modbusConfiguration.findUnique({ where: { deviceId: d.id } }),
  ).toMatchObject({ pollingEnabled: false });
  expect(
    await db.gatewayCommunicationIdentity.findUnique({
      where: { id: ident.id },
    }),
  ).toMatchObject({
    revocationRequestedAt: expect.any(Date),
    revocationConfirmedAt: null,
  });
  await expect(
    ingestion.ingestGatewayMessage(message.topic, message.payload),
  ).rejects.toBeDefined();
  await expect(
    credentials.manageGatewayCredential(g.id, { operation: "CREATE" }, "own"),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    identity.registerGatewayCommunicationIdentity(g.id, metadata(), "own"),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    db.gatewayCommand.create({
      data: {
        tenantId: "own",
        gatewayId: g.id,
        deviceId: d.id,
        action: "READ",
        revision: 1,
        expiresAt: new Date(),
      },
    }),
  ).rejects.toBeDefined();
  await expect(
    db.gatewayCredential.update({
      where: { id: message.credential.id },
      data: { status: "ACTIVE" },
    }),
  ).rejects.toBeDefined();
  expect(
    (await db.gateway.findUniqueOrThrow({ where: { id: g.id } }))
      .decommissionedAt,
  ).toBeInstanceOf(Date);
});
it("audit failure rolls back every decommission side effect", async () => {
  const g = await gateway("ACTIVE"),
    message = await signedHeartbeat(g.id);
  const d = await device(g.id);
  const communication = await identity.registerGatewayCommunicationIdentity(
    g.id,
    metadata(),
    "own",
  );
  await db.modbusConfiguration.create({
    data: {
      tenantId: "own",
      deviceId: d.id,
      configuration: defaultConfig,
      profile: profiles[0],
      pollingEnabled: true,
      state: "ACTIVE",
    },
  });
  const command = await db.gatewayCommand.create({
    data: {
      tenantId: "own",
      gatewayId: g.id,
      deviceId: d.id,
      action: "READ",
      revision: 1,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  await db.$executeRawUnsafe(
    `CREATE FUNCTION reject_gateway_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'gateway.lifecycle.change' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER reject_gateway_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_gateway_audit()`,
  );
  try {
    await expect(
      service.changeGatewayLifecycle(
        g.id,
        { status: "DECOMMISSIONED", revision: 0 },
        "own",
      ),
    ).rejects.toBeDefined();
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER reject_gateway_audit ON "AuditEvent"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION reject_gateway_audit()");
  }
  expect(await db.gateway.findUnique({ where: { id: g.id } })).toMatchObject({
    lifecycleStatus: "ACTIVE",
    revision: 0,
    decommissionedAt: null,
  });
  expect(
    await db.gatewayCredential.findUnique({
      where: { id: message.credential.id },
    }),
  ).toMatchObject({ status: "ACTIVE", revokedAt: null });
  expect(
    await db.gatewayCommand.findUnique({ where: { id: command.id } }),
  ).toMatchObject({ status: "PENDING", completedAt: null });
  expect(
    await db.modbusConfiguration.findUnique({ where: { deviceId: d.id } }),
  ).toMatchObject({ pollingEnabled: true });
  expect(
    await db.gatewayCommunicationIdentity.findUnique({
      where: { id: communication.id },
    }),
  ).toMatchObject({ revocationRequestedAt: null });
  expect(
    await db.auditEvent.count({
      where: { entityId: g.id, action: "gateway.lifecycle.change" },
    }),
  ).toBe(0);
});
it("terminal ingestion is rejected even if a legacy credential is still active", async () => {
  const g = await gateway(),
    message = await signedHeartbeat(g.id);
  // Synthetic inconsistent legacy state: prove the lifecycle guard independently
  // of the credential revocation performed by the normal service.
  await db.gateway.update({
    where: { id: g.id },
    data: { lifecycleStatus: "DECOMMISSIONED" },
  });
  await expect(
    ingestion.ingestGatewayMessage(message.topic, message.payload),
  ).rejects.toBeDefined();
  expect(
    (await db.gateway.findUniqueOrThrow({ where: { id: g.id } })).lastSeenAt,
  ).toBeNull();
});
it("failure reason is required and a new provisioning attempt clears it", async () => {
  const g = await gateway("PROVISIONING");
  await expect(
    service.changeGatewayLifecycle(
      g.id,
      { status: "FAILED", revision: 0 },
      "own",
    ),
  ).rejects.toMatchObject({ status: 400 });
  await service.changeGatewayLifecycle(
    g.id,
    { status: "FAILED", revision: 0, errorCode: "CONFIGURATION_FAILED" },
    "own",
  );
  expect(await db.gateway.findUnique({ where: { id: g.id } })).toMatchObject({
    provisioningErrorCode: "CONFIGURATION_FAILED",
    provisioningFailedAt: expect.any(Date),
  });
  await service.changeGatewayLifecycle(
    g.id,
    { status: "PROVISIONING", revision: 1 },
    "own",
  );
  expect(await db.gateway.findUnique({ where: { id: g.id } })).toMatchObject({
    provisioningErrorCode: null,
    provisioningFailedAt: null,
    provisioningStartedAt: expect.any(Date),
  });
});
it("concurrent credential creation cannot survive decommission", async () => {
  const g = await gateway();
  await Promise.allSettled([
    credentials.manageGatewayCredential(g.id, { operation: "CREATE" }, "own"),
    service.changeGatewayLifecycle(
      g.id,
      { status: "DECOMMISSIONED", revision: 0 },
      "own",
    ),
  ]);
  expect(
    (await db.gateway.findUniqueOrThrow({ where: { id: g.id } }))
      .lifecycleStatus,
  ).toBe("DECOMMISSIONED");
  expect(
    await db.gatewayCredential.count({
      where: { gatewayId: g.id, status: "ACTIVE" },
    }),
  ).toBe(0);
});
it("global search enforces direct grants, including legacy gateways", async () => {
  const visible = await gateway(),
    hidden = await gateway("NEW", p2.id),
    legacy = await gateway("NEW", null);
  const user: Actor = { ...admin, id: "reader", role: "USER", tenantId: "own" };
  const query = async (id: string, who = user) =>
    search.globalSearch(
      who,
      (await db.gateway.findUniqueOrThrow({ where: { id } })).externalGatewayId,
    );
  expect(await query(visible.id)).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: visible.id })]),
  );
  expect(await query(hidden.id)).toHaveLength(0);
  expect(await query(legacy.id)).toHaveLength(0);
  expect(await query(visible.id, { ...user, id: "no-grant" })).toHaveLength(0);
});
it.each(["SUPER_ADMIN", "TENANT_ADMIN", "MANAGER"] as const)(
  "search preserves %s visibility",
  async (role) => {
    const g = await gateway("NEW", null);
    const who = {
      ...admin,
      role,
      tenantId: role === "SUPER_ADMIN" ? null : "own",
    };
    expect(
      await search.globalSearch(
        who,
        g.externalGatewayId,
        role === "SUPER_ADMIN" ? "own" : undefined,
      ),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: g.id })]));
  },
);
it("communication inventory is strict public metadata with unique lowercase SHA256", async () => {
  const g = await gateway(),
    data = metadata();
  const registered = await identity.registerGatewayCommunicationIdentity(
    g.id,
    data,
    "own",
  );
  expect(
    await db.gatewayCommunicationIdentity.findUnique({
      where: { id: registered.id },
    }),
  ).toMatchObject({ commonName: g.id, enabledConfirmedAt: null });
  await expect(
    identity.registerGatewayCommunicationIdentity(g.id, data, "own"),
  ).rejects.toBeDefined();
  await expect(
    identity.registerGatewayCommunicationIdentity(
      g.id,
      { ...metadata(), privateKey: "test-forbidden" },
      "own",
    ),
  ).rejects.toBeDefined();
  await expect(
    identity.registerGatewayCommunicationIdentity(
      g.id,
      { ...metadata(), certificateFingerprint: "INVALID" },
      "own",
    ),
  ).rejects.toBeDefined();
  await expect(
    identity.registerGatewayCommunicationIdentity(g.id, metadata(), "foreign"),
  ).rejects.toMatchObject({ status: 404 });
  const columns = await db.$queryRaw<
    { column_name: string }[]
  >`SELECT column_name FROM information_schema.columns WHERE table_name='GatewayCommunicationIdentity'`;
  expect(
    columns.some((c) => /private|passphrase|secret|pem/i.test(c.column_name)),
  ).toBe(false);
});
it.each(["tenant", "commonName", "fingerprint", "validity"])(
  "database protects communication identity: %s",
  async (kind) => {
    const g = await gateway(),
      data = metadata();
    await expect(
      db.gatewayCommunicationIdentity.create({
        data: {
          ...data,
          notBefore: new Date(data.notBefore),
          expiresAt:
            kind === "validity" ? new Date(0) : new Date(data.expiresAt),
          tenantId: kind === "tenant" ? "foreign" : "own",
          gatewayId: g.id,
          commonName: kind === "commonName" ? "other" : g.id,
          ...(kind === "fingerprint"
            ? { certificateFingerprint: "UPPER" }
            : {}),
        },
      }),
    ).rejects.toBeDefined();
  },
);
it("migration is additive and contains no legacy reassignment statement", () => {
  const sql = readFileSync(
    `prisma/migrations/${migration}/migration.sql`,
    "utf8",
  );
  expect(sql).not.toMatch(/UPDATE\s+"Gateway"\s+SET/i);
  expect(sql).not.toContain('"propertyId" SET NOT NULL');
});
