import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { reconcileAlerts } from "../src/server/system-status";
import { ingestGatewayMessage } from "../src/server/gateway-ingestion";
import { signedMessage } from "../apps/edge-gateway/src/wire";
import { hashPassword } from "../src/server/password";
if (
  process.env.SEED_DEMO !== "true" ||
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Local demo only");
const base = process.env.APP_URL ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local HTTP only");
const tenantId = "demo-tenant-0",
  gatewayId = `test-${randomUUID()}`,
  foreignId = `test-${randomUUID()}`,
  deviceId = `test-${randomUUID()}`;
const sessions: string[] = [];
let count = 0;
let createdGatewayId: string | undefined;
const noGrantId = `test-${randomUUID()}`;
async function cookie(userId: string) {
  const token = randomBytes(32).toString("hex"),
    id = createHash("sha256").update(token).digest("hex");
  sessions.push(id);
  await db.session.create({
    data: { id, userId, expiresAt: new Date(Date.now() + 600000) },
  });
  return `meterwerk_session=${token}`;
}
async function request(
  path: string,
  status: number,
  session?: string,
  body?: unknown,
) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      origin: new URL(base).origin,
      ...(session ? { cookie: session } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(r.status, status, `${path}: ${r.status}`);
  count++;
  return r;
}
const root = `/api/gateways/${gatewayId}/credentials`;
try {
  await db.user.create({
    data: {
      id: noGrantId,
      tenantId,
      name: "Pilot no grant",
      email: `${noGrantId}@example.invalid`,
      role: "USER",
      passwordHash: await hashPassword(randomBytes(32).toString("hex")),
    },
  });
  for (const [id, tenant] of [
    [gatewayId, tenantId],
    [foreignId, "demo-tenant-1"],
  ])
    await db.gateway.create({
      data: {
        id,
        tenantId: tenant,
        name: "Pilot test",
        externalGatewayId: id,
        manufacturer: "Test",
        model: "Test",
        status: "OFFLINE",
        installedAt: new Date(),
      },
    });
  const admin = await cookie(`${tenantId}-user-0`),
    user = await cookie(`${tenantId}-user-2`),
    manager = await cookie(`${tenantId}-user-1`);
  const noGrant = await cookie(noGrantId);
  const platform = await cookie(
    (
      await db.user.findFirstOrThrow({
        where: { role: "SUPER_ADMIN" },
        select: { id: true },
      })
    ).id,
  );
  await request(root, 403, noGrant);
  await request(root, 400, platform);
  await request(root + `?tenantId=${tenantId}`, 200, platform);
  await request("/api/system/health", 403, noGrant);
  await request("/api/system/health", 400, platform);
  await request("/api/gateways", 403, user, {
    name: "Denied",
    externalGatewayId: "test-denied",
  });
  await request("/api/gateways", 403, manager, {
    name: "Denied",
    externalGatewayId: "test-denied",
  });
  await request("/api/gateways?tenantId=demo-tenant-1", 403, admin, {
    name: "Denied",
    externalGatewayId: "test-denied",
  });
  await request("/api/gateways", 400, admin, {
    name: "Denied",
    externalGatewayId: "test-denied",
    tenantId: "demo-tenant-1",
  });
  createdGatewayId = (
    await (
      await request("/api/gateways", 201, admin, {
        name: "Pilot fixture",
        externalGatewayId: randomUUID(),
      })
    ).json()
  ).id;
  await request(root, 401);
  await request(root, 403, user);
  await request(root, 403, manager);
  await request(root + "?tenantId=demo-tenant-1", 403, admin);
  await request(`/api/gateways/${foreignId}/credentials`, 404, admin);
  await request(root, 400, admin, { operation: "CREATE", role: "SUPER_ADMIN" });
  await request(root, 400, admin, {
    operation: "CREATE",
    expiresAt: "2000-01-01T00:00:00Z",
  });
  const created = (await (
    await request(root, 200, admin, { operation: "CREATE" })
  ).json()) as { id: string; privateKey: string };
  assert.match(created.privateKey, /PRIVATE KEY/);
  count++;
  const list = await (await request(root, 200, admin)).text();
  assert.ok(
    !list.includes(created.privateKey) &&
      !list.includes("privateKey") &&
      !list.includes("publicKey"),
  );
  count++;
  const credential = await db.gatewayCredential.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.equal(credential.keyFingerprint?.length, 64);
  assert.ok(!JSON.stringify(credential).includes(created.privateKey));
  count++;
  const topic = `meterwerk/v1/gateways/${gatewayId}/heartbeat`;
  const body = () => ({
    gatewayId,
    timestamp: new Date().toISOString(),
    agentVersion: "test",
    uptime: 1,
    connectedDevices: 0,
    queueSize: 1500,
    queueWarning: true,
  });
  await ingestGatewayMessage(
    topic,
    Buffer.from(signedMessage(topic, created.id, body(), created.privateKey)),
  );
  count++;
  assert.ok(
    (
      await db.gatewayCredential.findUniqueOrThrow({
        where: { id: created.id },
      })
    ).lastUsedAt,
  );
  count++;
  const rotated = (await (
    await request(root, 200, admin, {
      operation: "ROTATE",
      credentialId: created.id,
    })
  ).json()) as { id: string; privateKey: string };
  await assert.rejects(
    ingestGatewayMessage(
      topic,
      Buffer.from(signedMessage(topic, created.id, body(), created.privateKey)),
    ),
  );
  count++;
  const wrong = `meterwerk/v1/gateways/${foreignId}/heartbeat`;
  await ingestGatewayMessage(
    topic,
    Buffer.from(signedMessage(topic, rotated.id, body(), rotated.privateKey)),
  );
  count++;
  await db.gatewayCredential.update({
    where: { id: rotated.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await assert.rejects(
    ingestGatewayMessage(
      topic,
      Buffer.from(signedMessage(topic, rotated.id, body(), rotated.privateKey)),
    ),
  );
  count++;
  await db.gatewayCredential.update({
    where: { id: rotated.id },
    data: { expiresAt: null },
  });
  await assert.rejects(
    ingestGatewayMessage(
      wrong,
      Buffer.from(signedMessage(wrong, rotated.id, body(), rotated.privateKey)),
    ),
  );
  count++;
  await request(root, 404, admin, {
    operation: "REVOKE",
    credentialId: "foreign",
  });
  await request(root, 200, admin, {
    operation: "REVOKE",
    credentialId: rotated.id,
  });
  await assert.rejects(
    ingestGatewayMessage(
      topic,
      Buffer.from(signedMessage(topic, rotated.id, body(), rotated.privateKey)),
    ),
  );
  count++;
  const audit = await db.auditEvent.findMany({
    where: { entityId: { in: [created.id, rotated.id] } },
  });
  assert.ok(!JSON.stringify(audit).includes("PRIVATE KEY"));
  count++;
  await db.gateway.update({
    where: { id: gatewayId },
    data: { lastSeenAt: new Date(Date.now() - 60000) },
  });
  await db.device.create({
    data: {
      id: deviceId,
      tenantId,
      gatewayId,
      meterId: "demo-modbus-meter",
      externalDeviceId: deviceId,
      manufacturer: "Test",
      model: "Test",
      protocol: "MODBUS",
      status: "OFFLINE",
      installedAt: new Date(),
      lastSeenAt: new Date(Date.now() - 60000),
    },
  });
  await reconcileAlerts(tenantId);
  await reconcileAlerts(tenantId);
  const alarms = await db.technicalAlert.findMany({
    where: { tenantId, entityId: { in: [gatewayId, deviceId] }, active: true },
  });
  assert.equal(alarms.filter((a) => a.kind === "GATEWAY_OFFLINE").length, 1);
  assert.equal(alarms.filter((a) => a.kind === "DEVICE_OFFLINE").length, 1);
  assert.ok(alarms.some((a) => a.kind === "QUEUE_BACKLOG"));
  assert.ok(alarms.every((a) => a.occurrences === 1));
  count += 4;
  await db.gateway.update({
    where: { id: gatewayId },
    data: { lastSeenAt: new Date(), queueSize: 0, queueWarning: false },
  });
  await db.device.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date() },
  });
  await reconcileAlerts(tenantId);
  assert.equal(
    await db.technicalAlert.count({
      where: { entityId: { in: [gatewayId, deviceId] }, active: true },
    }),
    0,
  );
  count++;
  await request("/api/system/health", 401);
  await request("/api/system/health", 403, user);
  await request("/api/system/health", 403, manager);
  await request("/api/system/health?tenantId=demo-tenant-1", 403, admin);
  const health = await (await request("/api/system/health", 200, admin)).text();
  assert.ok(
    !health.includes(foreignId) &&
      !health.includes("PRIVATE KEY") &&
      !health.includes("passwordHash"),
  );
  count++;
  await request("/system-status", 200, admin);
  console.log(`${count} pilot integration checks passed`);
} finally {
  if (createdGatewayId) {
    await db.technicalAlert.deleteMany({
      where: { entityId: createdGatewayId },
    });
    await db.gateway.delete({ where: { id: createdGatewayId } });
  }
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  await db.user.deleteMany({ where: { id: noGrantId } });
  await db.device.deleteMany({ where: { id: deviceId } });
  await db.technicalAlert.deleteMany({
    where: { entityId: { in: [gatewayId, foreignId, deviceId] } },
  });
  await db.gateway.deleteMany({
    where: { id: { in: [gatewayId, foreignId] } },
  });
  await db.$disconnect();
}
