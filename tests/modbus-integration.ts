import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { db } from "../src/server/db";
import { defaultConfig } from "../src/lib/modbus/contracts";
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
const meterId = "demo-modbus-meter",
  tenantId = "demo-tenant-0",
  gatewayId = "demo-edge-gateway";
const root = `/api/meters/${meterId}/modbus`;
const sessions: string[] = [];
const noGrantId = `test-${randomUUID()}`;
const foreignGateway = `test-${randomUUID()}`;
let checks = 0;
async function session(userId: string) {
  const token = randomBytes(32).toString("hex");
  const id = createHash("sha256").update(token).digest("hex");
  sessions.push(id);
  await db.session.create({
    data: { id, userId, expiresAt: new Date(Date.now() + 600000) },
  });
  return `meterwerk_session=${token}`;
}
async function request(
  path: string,
  expected: number,
  cookie?: string,
  body?: unknown,
) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body
        ? { "content-type": "application/json", origin: new URL(base).origin }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, expected, `${path}: ${response.status}`);
  checks++;
  return response;
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(
  name: string,
  fn: () => Promise<boolean>,
  timeout = 60000,
) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) {
      console.log(`PASS ${name}`);
      checks++;
      return;
    }
    await pause(1000);
  }
  throw new Error(`Timeout: ${name}`);
}
type View = {
  devices: {
    id: string;
    status: string;
    diagnostic: {
      lastError: string | null;
      lastSuccessAt: string;
      lastPollAt: string;
      raw?: unknown;
      successes: number;
    };
    modbusConfig: {
      revision: number;
      state: string;
      pollingEnabled: boolean;
      step: number;
    };
    telemetry: {
      timestamp: string;
      measurements: { metric: string; value: string; unit: string }[];
    }[];
    commands: { id: string; status: string }[];
  }[];
};
try {
  await db.user.create({
    data: {
      id: noGrantId,
      tenantId,
      name: "Temporary grant test",
      email: `${noGrantId}@example.invalid`,
      role: "USER",
      passwordHash: await hashPassword(randomBytes(32).toString("hex")),
    },
  });
  await db.gateway.create({
    data: {
      id: foreignGateway,
      tenantId: "demo-tenant-1",
      name: "Foreign test",
      externalGatewayId: foreignGateway,
      manufacturer: "Test",
      model: "Test",
      status: "OFFLINE",
      installedAt: new Date(),
    },
  });
  const admin = await session("demo-tenant-0-user-0"),
    manager = await session("demo-tenant-0-user-1"),
    user = await session("demo-tenant-0-user-2"),
    none = await session(noGrantId),
    superAdmin = await session("platform-admin");
  const foreignMeter = await db.meter.findFirstOrThrow({
    where: { tenantId: "demo-tenant-1" },
    select: { id: true, unitId: true },
  });
  const view = async () =>
    (await (await request(root, 200, admin)).json()) as View;
  await request(root, 401);
  await request(root, 404, none);
  await request(root + "?tenantId=demo-tenant-1", 403, admin);
  await request(`/api/meters/${foreignMeter.id}/modbus`, 404, admin);
  await request(root, 400, superAdmin);
  await request(root + "?tenantId=" + tenantId, 200, superAdmin);
  await request(root + "?debug=true", 403, user);
  await request(root + "?debug=true", 403, manager);
  const configure = {
    operation: "CONFIGURE",
    gatewayId,
    configuration: {
      ...defaultConfig,
      pollingIntervalMs: 1000,
      timeoutMs: 300,
    },
  };
  await request(root, 403, manager, configure);
  await request(root, 403, user, configure);
  await request(root, 404, admin, { ...configure, gatewayId: foreignGateway });
  await request(root, 400, admin, { ...configure, role: "SUPER_ADMIN" });
  await request(root, 400, admin, {
    ...configure,
    configuration: { ...defaultConfig, port: 0 },
  });
  await request(root, 200, admin, {
    ...configure,
    configuration: { ...defaultConfig, profileId: "three-phase-template" },
  });
  await request(root, 409, admin, { operation: "COMMAND", action: "TEST" });
  await request(root, 200, admin, configure);
  await request(root, 409, admin, { operation: "COMPLETE" });
  async function command(action: string) {
    const result = (await (
      await request(root, 200, admin, { operation: "COMMAND", action })
    ).json()) as { commandId: string };
    await until(`${action} executed by gateway`, async () => {
      const status = (await view()).devices[0]?.commands.find(
        (c) => c.id === result.commandId,
      )?.status;
      if (status === "FAILED" || status === "EXPIRED")
        throw new Error(`${action}: ${status}`);
      return status === "SUCCEEDED";
    });
  }
  await command("TEST");
  await command("READ");
  let data = await view();
  assert.equal(data.devices[0].telemetry[0].measurements.length, 14);
  assert(
    data.devices[0].telemetry[0].measurements.some(
      (m) => m.metric === "voltageL1" && m.value === "230",
    ),
  );
  checks++;
  await request(root, 200, admin, {
    operation: "REVIEW",
    revision: data.devices[0].modbusConfig.revision,
  });
  await request(root, 404, admin, {
    operation: "ASSIGN",
    unitId: foreignMeter.unitId,
  });
  const own = await db.meter.findUniqueOrThrow({
    where: { id: meterId },
    select: { unitId: true },
  });
  await request(root, 200, admin, { operation: "ASSIGN", unitId: own.unitId });
  await request(root, 200, admin, { operation: "COMPLETE" });
  assert.equal((await view()).devices[0].modbusConfig.state, "ACTIVE");
  checks++;
  await command("START");
  const first = (await view()).devices[0].telemetry[0].timestamp;
  await until(
    "Live measurements advance without a manual page reload",
    async () => {
      const data = await view();
      return data.devices[0].telemetry[0].timestamp !== first;
    },
  );
  const html = await (
    await request(`/meters/${meterId}/modbus`, 200, admin)
  ).text();
  assert(
    html.includes("Modbus-Diagnose") &&
      html.includes("Verbindung testen") &&
      html.includes("Automatische Aktualisierung"),
  );
  checks++;
  const regular = (await (await request(root, 200, user)).json()) as View;
  assert(!("raw" in regular.devices[0].diagnostic));
  const debug = (await (
    await request(root + "?debug=true", 200, admin)
  ).json()) as View;
  assert(Array.isArray(debug.devices[0].diagnostic.raw));
  checks += 2;
  const exportQuery = new URLSearchParams({
    from: new Date(Date.now() - 3600000).toISOString(),
    to: new Date(Date.now() + 1000).toISOString(),
    metric: "voltageL1",
  });
  const csvPath = `/api/meters/${meterId}/export?${exportQuery}`;
  const csv = await request(csvPath, 200, user);
  assert(csv.headers.get("content-type")?.startsWith("text/csv"));
  const content = await csv.text();
  assert(content.includes('"voltageL1";"230";"V"'));
  checks++;
  await request(csvPath, 401);
  await request(csvPath, 404, none);
  await request(csvPath + "&tenantId=demo-tenant-1", 403, admin);
  await request(
    `/api/meters/${foreignMeter.id}/export?${exportQuery}`,
    404,
    admin,
  );
  await request(csvPath.replace("metric=voltageL1", "metric=bogus"), 400, user);
  await request(
    `/api/meters/${meterId}/export?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z&metric=voltageL1`,
    400,
    user,
  );
  const countBefore = await db.telemetrySample.count({
    where: { deviceId: "demo-modbus-device" },
  });
  await command("STOP");
  await pause(2500);
  const stoppedCount = await db.telemetrySample.count({
    where: { deviceId: "demo-modbus-device" },
  });
  await pause(3500);
  assert.equal(
    await db.telemetrySample.count({
      where: { deviceId: "demo-modbus-device" },
    }),
    stoppedCount,
  );
  assert(stoppedCount >= countBefore);
  checks++;
  await command("START");
  for (const fault of [
    "TIMEOUT",
    "WRONG_SLAVE",
    "INVALID_REGISTER",
    "UNREALISTIC",
    "COMMUNICATION",
    "DISCONNECTED",
  ]) {
    await writeFile(".local/simulator-fault.json", JSON.stringify({ fault }));
    await until(`Diagnosis reports ${fault}`, async () => {
      const d = (await view()).devices[0];
      return (
        d.diagnostic.lastError === fault &&
        ["WARNING", "OFFLINE"].includes(d.status)
      );
    });
    if (fault === "TIMEOUT")
      await until(
        "Repeated timeouts become OFFLINE",
        async () => (await view()).devices[0].status === "OFFLINE",
      );
    await writeFile(
      ".local/simulator-fault.json",
      JSON.stringify({ fault: "NONE" }),
    );
    await until(`Recovery after ${fault}`, async () => {
      const d = (await view()).devices[0];
      return (
        d.status === "ONLINE" &&
        d.diagnostic.lastError === null &&
        d.modbusConfig.state === "ACTIVE"
      );
    });
  }
  data = await view();
  assert(data.devices[0].diagnostic.successes > 0);
  console.log(`${checks} Phase-4a HTTP/database/end-to-end assertions passed`);
  await writeFile(
    ".local/phase4a-results.json",
    JSON.stringify(
      { at: new Date().toISOString(), checks, passed: true, metrics: 14 },
      null,
      2,
    ),
  );
} finally {
  await writeFile(
    ".local/simulator-fault.json",
    JSON.stringify({ fault: "NONE" }),
  );
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  await db.user.deleteMany({ where: { id: noGrantId } });
  await db.gateway.deleteMany({ where: { id: foreignGateway } });
  await db.$disconnect();
}
