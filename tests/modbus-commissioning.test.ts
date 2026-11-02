import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { defaultConfig, profiles } from "../src/lib/modbus/contracts";
const mock = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  });
  return {
    auth: vi.fn(),
    db: {
      device: model(),
      meter: model(),
      gateway: model(),
      gatewayCommand: model(),
      telemetrySample: model(),
      modbusConfiguration: model(),
      modbusDiagnostic: model(),
      unit: model(),
      reading: model(),
      auditEvent: model(),
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
    },
  };
});
vi.mock("../src/server/db", () => ({ db: mock.db }));
vi.mock("../src/server/auth", () => ({ requireActor: mock.auth }));
vi.mock("../src/server/licensing", () => ({
  requireTenantQuota: vi.fn(),
  recordTenantUsage: vi.fn(),
}));
import { writeModbus, readModbus } from "../src/server/modbus";
import { commissioningEvidence } from "../src/server/modbus-commissioning";
import { POST } from "../src/app/api/meters/[id]/modbus/route";
import type { Prisma } from "../src/generated/prisma/client";
const tx = mock.db as unknown as Prisma.TransactionClient;
const actor = {
  id: "admin",
  tenantId: "t",
  role: "TENANT_ADMIN",
  name: "Admin",
  email: "a@example.invalid",
};
let config: Record<string, unknown>;
let device: Record<string, unknown>;
let test: Record<string, unknown>;
let read: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_URL = "http://localhost:3000";
  config = {
    configuration: defaultConfig,
    profile: profiles[0],
    revision: 1,
    state: "COMMISSIONING",
    step: 6,
    reviewedRevision: 1,
    reviewedAt: new Date(),
    reviewedBy: actor.id,
    confirmedUnitId: "u",
    assignedAt: new Date(),
    assignedBy: actor.id,
    completedAt: null,
  };
  device = {
    id: "d",
    tenantId: "t",
    gatewayId: "g",
    gateway: { id: "g", status: "ONLINE" },
    modbusConfig: config,
    diagnostic: {
      revision: 1,
      successes: 1,
      lastSuccessAt: new Date(),
      responseMs: 12,
      lastError: null,
    },
  };
  test = {
    id: "test",
    action: "TEST",
    status: "SUCCEEDED",
    error: null,
    createdAt: new Date(Date.now() - 2000),
    completedAt: new Date(),
    expiresAt: new Date(Date.now() + 60000),
  };
  read = { ...test, id: "read", action: "READ" };
  mock.auth.mockResolvedValue(actor);
  mock.db.$transaction.mockImplementation((fn) => fn(mock.db));
  mock.db.meter.findFirst.mockResolvedValue({
    id: "m",
    tenantId: "t",
    unitId: "u",
    type: "ELECTRICITY",
    measurementUnit: "kWh",
  });
  mock.db.meter.findFirstOrThrow.mockResolvedValue({
    id: "m",
    tenantId: "t",
    unitId: "u",
    type: "ELECTRICITY",
    measurementUnit: "kWh",
  });
  mock.db.device.findFirst.mockImplementation(async () => device);
  mock.db.device.count.mockResolvedValue(1);
  mock.db.gateway.findFirst.mockResolvedValue({ id: "g", status: "ONLINE" });
  mock.db.gatewayCommand.findFirst.mockImplementation(async ({ where }) =>
    where.action === "TEST" ? test : read,
  );
  mock.db.telemetrySample.findFirst.mockResolvedValue({
    id: "sample",
    timestamp: new Date(),
  });
  mock.db.unit.findFirst.mockResolvedValue({ id: "u" });
});
const complete = () => writeModbus("m", { operation: "COMPLETE" });
const forbidden = async () => {
  await expect(complete()).rejects.toMatchObject({ status: 409 });
  expect(mock.db.modbusConfiguration.update).not.toHaveBeenCalled();
};
describe("commissioning server gates (software fixtures, no hardware claim)", () => {
  it("A: offline gateway and pending TEST cannot complete", async () => {
    device.gateway = { id: "g", status: "OFFLINE" };
    test.status = "PENDING";
    test.completedAt = null;
    device.diagnostic = null;
    await forbidden();
    expect((await commissioningEvidence(tx, "t", "d", "u")).reason).toContain(
      "noch nicht vom Gateway ausgeführt",
    );
  });
  it("B: successful TEST with pending READ cannot complete or review", async () => {
    read.status = "PENDING";
    await forbidden();
    await expect(
      writeModbus("m", { operation: "REVIEW", revision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("C: successful reads without human review cannot complete", async () => {
    config.reviewedRevision = null;
    await forbidden();
  });
  it("D: missing unit confirmation cannot complete", async () => {
    config.assignedAt = null;
    await forbidden();
  });
  it("E: review, assignment and completion persist actor/time with atomic audit evidence", async () => {
    await writeModbus("m", { operation: "REVIEW", revision: 1 });
    expect(mock.db.modbusConfiguration.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewedBy: "admin",
          reviewedAt: expect.any(Date),
        }),
      }),
    );
    await writeModbus("m", { operation: "ASSIGN", unitId: "u" });
    expect(mock.db.modbusConfiguration.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedBy: "admin",
          assignedAt: expect.any(Date),
        }),
      }),
    );
    await complete();
    expect(mock.db.modbusConfiguration.update).toHaveBeenLastCalledWith({
      where: { deviceId: "d" },
      data: {
        state: "ACTIVE",
        completedAt: expect.any(Date),
        completedBy: "admin",
      },
    });
    expect(mock.db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "modbus.complete.evidence",
          details: expect.objectContaining({
            testCommandId: "test",
            sampleId: "sample",
            revision: 1,
            gatewayId: "g",
          }),
        }),
      }),
    );
  });
  it.each([
    { host: "localhost" },
    { port: 1503 },
    { unitId: 2 },
    { profileId: "sdm630-template-v1" },
    {
      interface: "RTU",
      comPort: "COM3",
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "even",
      slaveId: 1,
    },
  ])("F: configuration changes invalidate all evidence: %j", async (change) => {
    const profileId = change.profileId
      ? profiles.find((p) => p.id !== defaultConfig.profileId)!.id
      : defaultConfig.profileId;
    const configuration =
      change.interface === "RTU"
        ? { ...change, profileId, pollingIntervalMs: 5000, timeoutMs: 1000 }
        : { ...defaultConfig, ...change, profileId };
    await writeModbus("m", {
      operation: "CONFIGURE",
      gatewayId: "g",
      configuration,
    });
    expect(mock.db.modbusConfiguration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          revision: { increment: 1 },
          reviewedRevision: null,
          reviewedAt: null,
          assignedAt: null,
          completedAt: null,
          state: "COMMISSIONING",
        }),
      }),
    );
    expect(mock.db.modbusDiagnostic.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "t", deviceId: "d" },
    });
    config.revision = 2;
    await expect(complete()).rejects.toMatchObject({ status: 409 });
  });
  it("G: direct HTTP completion returns understandable 409", async () => {
    test.status = "PENDING";
    const response = await POST(
      new NextRequest("http://localhost:3000/api/meters/m/modbus", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ operation: "COMPLETE" }),
      }),
      { params: Promise.resolve({ id: "m" }) },
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain(
      "noch nicht vom Gateway ausgeführt",
    );
  });
  it.each([
    "PENDING",
    "EXPIRED",
    "FAILED",
    "TIMEOUT",
    "OFFLINE",
    "ERROR",
    "CANCELLED",
  ])("H: %s is never successful", async (status) => {
    test.status = status;
    await forbidden();
    test.status = "SUCCEEDED";
    read.status = status;
    await forbidden();
  });
  it.each([
    { successes: 0 },
    { lastSuccessAt: null },
    { responseMs: null },
    { revision: 0 },
    { lastError: "TIMEOUT" },
  ])("rejects missing or stale diagnostic evidence: %j", async (change) => {
    device.diagnostic = { ...(device.diagnostic as object), ...change };
    await forbidden();
  });
  it("requires actual stored measurements even with successful command acknowledgements", async () => {
    mock.db.telemetrySample.findFirst.mockResolvedValue(null);
    await forbidden();
  });
  it("blocks an older outstanding command even when the latest command succeeded", async () => {
    mock.db.gatewayCommand.count.mockResolvedValue(1);
    await forbidden();
  });
  it("rejects disabled gateway and stale sample", async () => {
    device.gateway = { id: "g", status: "DISABLED" };
    await forbidden();
    device.gateway = { id: "g", status: "ONLINE" };
    mock.db.telemetrySample.findFirst.mockResolvedValue({
      id: "old",
      timestamp: new Date(0),
    });
    await forbidden();
  });
  it("scopes evidence to tenant, gateway and active revision", async () => {
    await complete();
    expect(mock.db.gatewayCommand.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "t",
          deviceId: "d",
          gatewayId: "g",
          revision: 1,
          action: "TEST",
        },
      }),
    );
  });
  it("rejects foreign tenant and unknown meter", async () => {
    await expect(
      writeModbus("m", { operation: "COMPLETE" }, "foreign"),
    ).rejects.toMatchObject({ status: 403 });
    mock.db.meter.findFirst.mockResolvedValue(null);
    await expect(complete()).rejects.toMatchObject({ status: 404 });
  });
  it.each(["USER", "MANAGER"])(
    "prevents role escalation by %s",
    async (role) => {
      mock.auth.mockResolvedValue({ ...actor, role });
      await expect(complete()).rejects.toMatchObject({ status: 403 });
    },
  );
  it("USER without grant cannot read evidence", async () => {
    mock.auth.mockResolvedValue({ ...actor, role: "USER" });
    mock.db.meter.findFirst.mockResolvedValue(null);
    await expect(readModbus("m")).rejects.toMatchObject({ status: 404 });
    expect(mock.db.meter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unit: {
            building: {
              property: {
                tenantId: "t",
                grants: { some: { userId: "admin", tenantId: "t" } },
              },
            },
          },
        }),
      }),
    );
  });
  it("SUPER_ADMIN must explicitly select a tenant", async () => {
    mock.auth.mockResolvedValue({
      ...actor,
      role: "SUPER_ADMIN",
      tenantId: null,
    });
    await expect(complete()).rejects.toMatchObject({ status: 400 });
  });
});
