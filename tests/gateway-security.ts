import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { db } from "../src/server/db";
import { ingestGatewayMessage } from "../src/server/gateway-ingestion";
import { dashboard } from "../src/server/dashboard";
import { signedMessage } from "../apps/edge-gateway/src/wire";
if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Demo only");
const key = await readFile(".local/gateway-private.pem", "utf8");
const credentialId = "demo-edge-credential",
  gatewayId = "demo-edge-gateway";
const topic = `meterwerk/v1/gateways/${gatewayId}/readings`;
const body = {
  messageId: randomUUID(),
  deviceId: "demo-modbus-device",
  timestamp: new Date().toISOString(),
  value: "0.000000",
  consumption: "0.000000",
  unit: "kWh",
  source: "MQTT",
  quality: "VALID",
};
let count = 0;
const fixtureIds = [randomUUID(), randomUUID()];
async function rejects(
  name: string,
  destination: string,
  value: unknown,
  signingKey = key,
  credential = credentialId,
) {
  await assert.rejects(
    ingestGatewayMessage(
      destination,
      Buffer.from(signedMessage(destination, credential, value, signingKey)),
    ),
  );
  count++;
  console.log(`PASS ${name}`);
}
try {
  const foreignMeter = await db.meter.findFirstOrThrow({
    where: { tenantId: "demo-tenant-1" },
    select: { id: true, tenantId: true },
  });
  const ownMeter = await db.meter.findUniqueOrThrow({
    where: { id: "demo-modbus-meter" },
    select: { id: true, tenantId: true },
  });
  for (const [index, meter] of [foreignMeter, ownMeter].entries()) {
    await db.device.create({
      data: {
        id: fixtureIds[index],
        tenantId: meter.tenantId,
        meterId: meter.id,
        externalDeviceId: fixtureIds[index],
        manufacturer: "Test",
        model: "Test",
        protocol: "MODBUS",
        status: "ONLINE",
        installedAt: new Date(),
      },
    });
  }
  const wrongKey = generateKeyPairSync("ed25519")
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();
  await rejects("invalid signature", topic, body, wrongKey);
  await rejects("unknown credential", topic, body, key, "unknown");
  await rejects(
    "foreign gateway topic",
    "meterwerk/v1/gateways/foreign/readings",
    body,
  );
  await rejects("foreign device ID", topic, { ...body, deviceId: "foreign" });
  await rejects("existing device from foreign tenant", topic, {
    ...body,
    deviceId: fixtureIds[0],
  });
  await rejects("existing device not assigned to this gateway", topic, {
    ...body,
    deviceId: fixtureIds[1],
  });
  await rejects("tenant injection", topic, {
    ...body,
    tenantId: "demo-tenant-1",
  });
  await rejects("role escalation", topic, { ...body, role: "SUPER_ADMIN" });
  await rejects("unit mismatch", topic, { ...body, unit: "m³" });
  await rejects(
    "heartbeat identity",
    `meterwerk/v1/gateways/${gatewayId}/heartbeat`,
    {
      gatewayId: "foreign",
      timestamp: new Date().toISOString(),
      agentVersion: "test",
      uptime: 1,
      connectedDevices: 1,
      queueSize: 0,
    },
  );
  await rejects(
    "stale heartbeat",
    `meterwerk/v1/gateways/${gatewayId}/heartbeat`,
    {
      gatewayId,
      timestamp: "2020-01-01T00:00:00.000Z",
      agentVersion: "test",
      uptime: 1,
      connectedDevices: 1,
      queueSize: 0,
    },
  );
  await db.gatewayCredential.update({
    where: { id: credentialId },
    data: { status: "REVOKED" },
  });
  try {
    await rejects("revoked credential", topic, body);
  } finally {
    await db.gatewayCredential.update({
      where: { id: credentialId },
      data: { status: "ACTIVE" },
    });
  }
  assert.equal(
    await db.reading.count({ where: { messageId: body.messageId } }),
    0,
  );
  const actor = {
    id: "demo-tenant-0-user-2",
    tenantId: "demo-tenant-0",
    role: "USER" as const,
    name: "Test",
    email: "user@nordstern.demo",
  };
  assert.equal(
    (await dashboard({ ...actor, id: "no-grants" }, undefined, "ELECTRICITY"))
      .edgeDevices.length,
    0,
  );
  count++;
  assert.equal(
    (
      await dashboard(
        { ...actor, id: "demo-tenant-1-user-2", tenantId: "demo-tenant-1" },
        undefined,
        "ELECTRICITY",
      )
    ).edgeDevices.length,
    0,
  );
  count++;
  await assert.rejects(dashboard(actor, "demo-tenant-1", "ELECTRICITY"));
  count++;
  await assert.rejects(
    dashboard(
      { ...actor, role: "SUPER_ADMIN", tenantId: null },
      undefined,
      "ELECTRICITY",
    ),
  );
  count++;
  console.log(`${count} gateway security checks passed`);
} finally {
  await db.device.deleteMany({ where: { id: { in: fixtureIds } } });
  await db.$disconnect();
}
