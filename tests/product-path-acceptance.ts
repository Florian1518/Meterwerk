import assert from "node:assert/strict";
import { createServer } from "node:net";
import { createHmac, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { db } from "../src/server/db";
import { runDemoCommandAdapter } from "../src/server/demo-command-adapter";
assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
const base = process.env.APP_URL!;
assert.equal(new URL(base).hostname, "127.0.0.1");
const tenantId = "demo-tenant-0";
const deviceId = "scenario-demo-tenant-0-device";
const meterId = "scenario-demo-tenant-0-electricity";
const sessions: string[] = [];
const results: string[] = [];
let checks = 0;
function check(value: unknown, message: string) {
  assert(value, message);
  checks++;
}
async function session(userId: string) {
  const token = randomBytes(32).toString("hex");
  const id = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(token)
    .digest("hex");
  await db.session.create({
    data: { id, userId, expiresAt: new Date(Date.now() + 3600000) },
  });
  sessions.push(id);
  return `meterwerk_session=${token}`;
}
async function req(
  path: string,
  cookie: string,
  body?: object | FormData,
  method = body ? "POST" : "GET",
  expected = method === "POST" ? 201 : 200,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      cookie,
      origin: base,
      ...(body && !(body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
    },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  assert.equal(response.status, expected, `${method} ${path}`);
  checks++;
  return response;
}
// Test-only clamd protocol peer; no external provider or real malware involved.
let infected = false;
const scanner = createServer((socket) => {
  let data = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    data = Buffer.concat([data, chunk]);
    if (data.length > 14 && data.subarray(-4).equals(Buffer.alloc(4)))
      socket.end(infected ? "stream: Synthetic-Test FOUND\0" : "stream: OK\0");
  });
});
await new Promise<void>((resolve) =>
  scanner.listen(13310, "127.0.0.1", resolve),
);
try {
  const admin = await session(`${tenantId}-user-0`),
    user = await session(`${tenantId}-user-2`),
    foreign = await session("demo-tenant-1-user-0"),
    platform = await session("platform-admin");
  await req(
    "/api/platform/demo",
    platform,
    { action: "scenario", scenario: "OPEN_ALARM", tenantId },
    "POST",
    200,
  );
  const alarmId = "scenario-demo-tenant-0-alarm";
  for (const status of ["ACKNOWLEDGED", "RESOLVED"]) {
    await req(`/api/alarms/${alarmId}`, admin, { status }, "PATCH");
    check(
      (await db.alarm.findUniqueOrThrow({ where: { id: alarmId } })).status ===
        status,
      "alarm persisted",
    );
  }
  results.push("alarms: open/acknowledge/resolve");
  const forecast = await (
    await req(`/api/analytics/forecast?horizon=week&meterId=${meterId}`, admin)
  ).json();
  check(
    forecast.forecasts.length === 1 && forecast.forecasts[0].status === "ok",
    "forecast product output",
  );
  for (const cookie of [user, foreign])
    await req(
      `/api/analytics/forecast?horizon=week&meterId=${meterId}`,
      cookie,
      undefined,
      "GET",
      404,
    );
  await req(
    "/api/platform/demo",
    platform,
    { action: "scenario", scenario: "WATER_LEAK", tenantId },
    "POST",
    200,
  );
  const anomalies = await (
    await req("/api/analytics/insights?kind=persisted", admin)
  ).json();
  check(
    anomalies.some((a: { type: string }) => a.type === "WATER_LEAK_INDICATOR"),
    "persisted leak visible",
  );
  const denied = await (
    await req("/api/analytics/insights?kind=persisted", user)
  ).json();
  check(
    !denied.some(
      (a: { id: string }) => a.id === "scenario-demo-tenant-0-anomaly",
    ),
    "anomaly respects grants",
  );
  results.push("analytics: forecast/anomaly/grants");
  const rotation = await (
    await req(`/api/devices/${deviceId}/credentials/rotate`, admin, {})
  ).json();
  check(typeof rotation.token === "string", "rotation returns one-time token");
  await req(`/api/devices/${deviceId}/credentials/rotate`, admin, {});
  check(
    (
      await db.deviceCredential.findUniqueOrThrow({
        where: { id: rotation.credentialId },
      })
    ).status === "REVOKED",
    "old credential revoked",
  );
  await req(
    `/api/devices/${deviceId}/credentials/rotate`,
    user,
    {},
    "POST",
    403,
  );
  await req(
    `/api/devices/${deviceId}/credentials/rotate`,
    foreign,
    {},
    "POST",
    404,
  );
  await req("/api/maintenance-windows", admin, {
    deviceId,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    reason: "Synthetic acceptance",
  });
  const rollout = await (
    await req("/api/firmware-rollouts", admin, {
      deviceIds: [deviceId],
      targetVersion: "synthetic-acceptance",
    })
  ).json();
  check(rollout.status === "DRAFT", "rollout only prepared");
  const command = await (
    await req(`/api/devices/${deviceId}/commands`, admin, {
      action: "STATUS_REQUEST",
    })
  ).json();
  check(
    (await db.gatewayCommand.findUniqueOrThrow({ where: { id: command.id } }))
      .status === "QUEUED",
    "remote command persisted; no real dispatch",
  );
  await runDemoCommandAdapter(
    {
      id: "platform-admin",
      tenantId: null,
      role: "SUPER_ADMIN",
      name: "Synthetic",
      email: "synthetic@example.invalid",
    },
    tenantId,
  );
  check(
    (await db.gatewayCommand.findUniqueOrThrow({ where: { id: command.id } }))
      .status === "SUCCEEDED",
    "local test adapter completed command",
  );
  check(
    (await db.auditEvent.count({
      where: {
        tenantId,
        entityId: command.id,
        action: "demo.command.simulated",
      },
    })) === 1,
    "test adapter audit",
  );
  results.push(
    "device: rotation/maintenance/rollout/command queue with local test adapter",
  );
  await req("/api/incidents", admin, {
    title: "Synthetic acceptance",
    description: "Local incident only",
    severity: "MINOR",
    scope: "TENANT",
  });
  await req("/api/support/diagnostics?bundle=true", admin);
  await req("/api/operations/queue", admin);
  await req("/api/system/health", admin);
  await req("/api/system/maintenance", platform, {
    tenantId,
    enabled: true,
    reason: "Synthetic acceptance",
    endsAt: new Date(Date.now() + 1000).toISOString(),
  });
  await req("/api/system/maintenance", platform, {
    tenantId,
    enabled: false,
    reason: "Synthetic acceptance complete",
  });
  results.push("operations: incident/diagnostics/queue/health/maintenance");
  for (const bad of [false, true]) {
    infected = bad;
    const form = new FormData();
    form.set("targetType", "METER");
    form.set("entityId", meterId);
    form.set(
      "file",
      new File(["Synthetic acceptance file"], "acceptance.txt", {
        type: "text/plain",
      }),
    );
    const attachment = await (
      await req("/api/attachments", admin, form)
    ).json();
    const row = await db.attachment.findUniqueOrThrow({
      where: { id: attachment.id },
    });
    check(row.tenantId === tenantId, "attachment tenant binding");
    const downloaded = await req(
      `/api/attachments/${attachment.id}`,
      admin,
      undefined,
      "GET",
      bad ? 423 : 200,
    );
    if (!bad)
      check(
        (await downloaded.text()) === "Synthetic acceptance file",
        "download content",
      );
    await req(
      `/api/attachments/${attachment.id}`,
      foreign,
      undefined,
      "GET",
      404,
    );
    await req(`/api/attachments/${attachment.id}`, user, undefined, "GET", 404);
  }
  results.push(
    "attachments: upload/tenant/authorization/download/quarantine/testscanner",
  );
  console.log(`PASS ${checks} checks`, results);
} finally {
  scanner.close();
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  await writeFile(
    ".local/acceptance/product-path-results.json",
    JSON.stringify({ checks, results }, null, 2),
  );
  await db.$disconnect();
}
