import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Actor } from "../src/server/policy";
const auth = vi.hoisted(() => ({ actor: null as Actor | null }));
vi.mock("../src/server/auth", () => ({ requireActor: async () => auth.actor }));
import { db } from "../src/server/db";
import { readModbus, writeModbus } from "../src/server/modbus";
import { updateDevice } from "../src/server/device-management";
import {
  gatewayControl,
  acceptTelemetry,
} from "../src/server/modbus-ingestion";
import { defaultConfig, profiles } from "../src/lib/modbus/contracts";
import { decodeRegister } from "../apps/edge-gateway/src/registers";
const tenantId = `commissioning-test-${randomUUID()}`;
const meterId = `${tenantId}-meter`,
  deviceId = `${tenantId}-device`,
  gatewayId = `${tenantId}-gateway`,
  unitId = `${tenantId}-unit`;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.METERWERK_ENV).toBe("test");
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.port).toBe("55435");
  expect(url.pathname).toBe("/meterwerk_acceptance");
  auth.actor = {
    id: `${tenantId}-actor`,
    tenantId,
    role: "TENANT_ADMIN",
    name: "Software test",
    email: "test@example.invalid",
  };
  await db.tenant.create({
    data: { id: tenantId, slug: tenantId, name: "Commissioning software test" },
  });
  await db.property.create({
    data: {
      id: tenantId,
      tenantId,
      name: "Test",
      address: "Test",
      city: "Test",
    },
  });
  await db.building.create({
    data: { id: tenantId, tenantId, propertyId: tenantId, name: "Test" },
  });
  await db.unit.create({
    data: {
      id: unitId,
      tenantId,
      buildingId: tenantId,
      name: "Test",
      floor: "0",
      area: "1",
    },
  });
  await db.meter.create({
    data: {
      id: meterId,
      tenantId,
      unitId,
      serialNumber: "TEST-EL-001",
      type: "ELECTRICITY",
      manufacturer: "Software",
      model: "Fixture",
      measurementUnit: "kWh",
      location: "Test",
      installedAt: new Date(),
      demoPricePerUnit: "0",
    },
  });
  await db.gateway.create({
    data: {
      id: gatewayId,
      tenantId,
      externalGatewayId: gatewayId,
      name: "Software fixture",
      manufacturer: "Test",
      model: "Test",
      status: "OFFLINE",
      installedAt: new Date(),
    },
  });
  await db.device.create({
    data: {
      id: deviceId,
      tenantId,
      meterId,
      gatewayId,
      externalDeviceId: deviceId,
      manufacturer: "Test",
      model: "Test",
      protocol: "MODBUS",
      installedAt: new Date(),
    },
  });
});
afterAll(async () => {
  await db.measurement.deleteMany({ where: { tenantId } });
  await db.reading.deleteMany({ where: { tenantId } });
  await db.technicalMeasurement.deleteMany({ where: { tenantId } });
  await db.telemetrySample.deleteMany({ where: { tenantId } });
  await db.device.deleteMany({ where: { tenantId } });
  await db.gateway.deleteMany({ where: { tenantId } });
  await db.meter.deleteMany({ where: { tenantId } });
  await db.unit.deleteMany({ where: { tenantId } });
  await db.building.deleteMany({ where: { tenantId } });
  await db.property.deleteMany({ where: { tenantId } });
  await db.auditEvent.deleteMany({ where: { tenantId } });
  await db.tenant.deleteMany({ where: { id: tenantId } });
  await db.$disconnect();
});
const complete = () => writeModbus(meterId, { operation: "COMPLETE" });
async function acknowledge(id: string, ok = true) {
  return db.$transaction((tx) =>
    gatewayControl(tx, tenantId, gatewayId, {
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      results: [{ id, ok, error: ok ? null : "TIMEOUT" }],
    }),
  );
}
async function sample() {
  const profile = profiles[0];
  // Synthetic protocol payload, explicitly not hardware validation.
  const values = profile.registers.map((r) => {
    const b = Buffer.alloc(r.length * 2);
    const value = r.metric.startsWith("voltage")
      ? 230
      : r.metric === "frequency"
        ? 50
        : 1;
    if (r.dataType === "uint64") b.writeBigUInt64BE(1000000n);
    else b.writeFloatBE(value);
    return {
      metric: r.metric,
      register: r.address!,
      raw: b.toString("hex"),
      value: decodeRegister(b, r),
      unit: r.unit,
    };
  });
  return db.$transaction((tx) =>
    acceptTelemetry(tx, tenantId, gatewayId, {
      kind: "telemetry",
      deviceId,
      messageId: randomUUID(),
      revision: 1,
      timestamp: new Date().toISOString(),
      responseMs: 12,
      error: null,
      values,
    }),
  );
}
it("persists A–H through real PostgreSQL, validated ingestion, gateway acknowledgements and service gates", async () => {
  await writeModbus(meterId, {
    operation: "CONFIGURE",
    gatewayId,
    configuration: defaultConfig,
  });
  const test = await writeModbus(meterId, {
    operation: "COMMAND",
    action: "TEST",
  });
  await expect(complete()).rejects.toMatchObject({ status: 409 });
  expect((await readModbus(meterId)).devices[0].commissioning.stage).toBe(
    "CONFIGURED",
  );
  await acknowledge(test.commandId!);
  const read = await writeModbus(meterId, {
    operation: "COMMAND",
    action: "READ",
  });
  await expect(complete()).rejects.toMatchObject({ status: 409 });
  await acknowledge(read.commandId!);
  await expect(
    writeModbus(meterId, { operation: "REVIEW", revision: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  await sample();
  await expect(complete()).rejects.toMatchObject({ status: 409 });
  expect((await readModbus(meterId)).devices[0].commissioning.stage).toBe(
    "READ_VERIFIED",
  );
  await writeModbus(meterId, { operation: "REVIEW", revision: 1 });
  await expect(complete()).rejects.toMatchObject({ status: 409 });
  await writeModbus(meterId, { operation: "ASSIGN", unitId });
  await complete();
  const saved = await db.modbusConfiguration.findUniqueOrThrow({
    where: { deviceId },
  });
  expect(saved).toMatchObject({
    state: "ACTIVE",
    reviewedBy: auth.actor!.id,
    assignedBy: auth.actor!.id,
    completedBy: auth.actor!.id,
  });
  expect(saved.completedAt).toBeInstanceOf(Date);
  await expect(
    updateDevice(deviceId, { protocol: "REST" }),
  ).rejects.toMatchObject({ status: 409 });
  // Exercise the exact data-repair statement without replaying schema changes.
  const sql = await readFile(
    "prisma/migrations/202610220001_modbus_commissioning_evidence/migration.sql",
    "utf8",
  );
  const repair = sql.slice(sql.indexOf("WITH invalid AS"));
  await db.$executeRawUnsafe(repair);
  expect(
    (await db.modbusConfiguration.findUniqueOrThrow({ where: { deviceId } }))
      .state,
  ).toBe("ACTIVE");
  await db.modbusDiagnostic.deleteMany({ where: { deviceId, tenantId } });
  await db.$executeRawUnsafe(repair);
  expect(
    (await db.modbusConfiguration.findUniqueOrThrow({ where: { deviceId } }))
      .state,
  ).toBe("COMMISSIONING");
  expect(
    await db.auditEvent.count({
      where: { tenantId, action: "modbus.commissioning.integrity-repair" },
    }),
  ).toBe(1);
  await writeModbus(meterId, {
    operation: "CONFIGURE",
    gatewayId,
    configuration: {
      ...defaultConfig,
      host: "localhost",
      port: 1503,
      unitId: 2,
    },
  });
  await expect(complete()).rejects.toMatchObject({ status: 409 });
  const expired = await writeModbus(meterId, {
    operation: "COMMAND",
    action: "TEST",
  });
  await db.gatewayCommand.update({
    where: { id: expired.commandId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  expect(
    (await readModbus(meterId)).devices[0].commands.find(
      (c) => c.id === expired.commandId,
    )?.status,
  ).toBe("EXPIRED");
  await acknowledge(expired.commandId!);
  expect(
    (
      await db.gatewayCommand.findUniqueOrThrow({
        where: { id: expired.commandId },
      })
    ).status,
  ).toBe("EXPIRED");
  await expect(complete()).rejects.toMatchObject({ status: 409 });
  auth.actor = { ...auth.actor!, role: "USER" };
  await expect(readModbus(meterId)).rejects.toMatchObject({ status: 404 });
  await expect(complete()).rejects.toMatchObject({ status: 403 });
  auth.actor = { ...auth.actor!, role: "TENANT_ADMIN", tenantId: "foreign" };
  await expect(complete()).rejects.toMatchObject({ status: 404 });
});
