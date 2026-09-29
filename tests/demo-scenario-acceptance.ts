import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { db } from "../src/server/db";
import {
  DEMO_SCENARIOS,
  assertDemoScenarioEnvironment,
} from "../src/server/demo-scenarios";

assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
const base = process.env.APP_URL!;
assert.equal(new URL(base).hostname, "127.0.0.1");
const tenantId = "demo-tenant-0";
const id = (kind: string) => `scenario-${tenantId}-${kind}`;
const sessions: string[] = [];
let checks = 0;
function check(value: unknown, message: string) {
  assert(value, message);
  checks++;
}
async function session(userId: string) {
  const token = randomBytes(32).toString("hex");
  const hash = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(token)
    .digest("hex");
  await db.session.create({
    data: { id: hash, userId, expiresAt: new Date(Date.now() + 3600000) },
  });
  sessions.push(hash);
  return `meterwerk_session=${token}`;
}
async function api(
  path: string,
  cookie: string,
  body?: object,
  expected = 200,
) {
  const response = await fetch(base + path, {
    headers: { cookie, origin: base, "content-type": "application/json" },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  assert.equal(
    response.status,
    expected,
    `${path}: ${await response.clone().text()}`,
  );
  checks++;
  return response.json();
}
const results: object[] = [];
try {
  const platform = await session("platform-admin");
  const admin = await session(`${tenantId}-user-0`);
  const user = await session(`${tenantId}-user-2`);
  const foreign = await session("demo-tenant-1-user-0");
  for (const env of ["production", "staging", "development"] as const) {
    assert.throws(() => assertDemoScenarioEnvironment(env));
    checks++;
  }
  await api(
    "/api/platform/demo",
    admin,
    { action: "scenario", scenario: "NORMAL", tenantId },
    403,
  );
  await api(
    "/api/platform/demo",
    user,
    { action: "scenario", scenario: "NORMAL", tenantId },
    403,
  );
  await api(
    "/api/platform/demo",
    platform,
    { action: "scenario", scenario: "NORMAL", tenantId: "foreign" },
    400,
  );
  await api(
    "/api/platform/demo",
    platform,
    { action: "scenario", scenario: "NORMAL" },
    400,
  );
  const otherBefore = await db.reading.count({
    where: { tenantId: "demo-tenant-1" },
  });
  for (const scenario of DEMO_SCENARIOS) {
    const startChecks = checks;
    // Seed is a deterministic fixture upsert inside NORMAL, not a global reset.
    await api("/api/platform/demo", platform, { action: "reset", tenantId });
    check(
      (await db.reading.count({
        where: { tenantId, meterId: id("electricity") },
      })) === 48,
      "normal readings",
    );
    check(
      (await db.alarm.count({ where: { tenantId, id: id("alarm") } })) === 0,
      "normal has no scenario alarm",
    );
    const auditBefore = await db.auditEvent.count({
      where: { tenantId, action: "demo.scenario.activated" },
    });
    const state = await api("/api/platform/demo", platform, {
      action: "scenario",
      scenario,
      tenantId,
    });
    const read = await api(`/api/platform/demo?tenantId=${tenantId}`, platform);
    check(
      read.scenario === scenario && read.tenantId === tenantId,
      "API state",
    );
    const e = await db.meter.findUniqueOrThrow({
      where: { id: id("electricity") },
    });
    const gateway = await db.gateway.findUniqueOrThrow({
      where: { id: id("gateway") },
    });
    const sum = await db.reading.aggregate({
      where: { tenantId, meterId: id("electricity") },
      _sum: { consumption: true },
      _count: true,
    });
    check(
      sum._count === (scenario === "MISSING_DATA" ? 42 : 48),
      "reading gap",
    );
    check(
      sum._sum.consumption?.toString() ===
        (["HIGH_ELECTRICITY", "CRITICAL_ANOMALY"].includes(scenario)
          ? "960"
          : scenario === "MISSING_DATA"
            ? "84"
            : "96"),
      "actual consumption",
    );
    check(
      e.status ===
        (scenario === "METER_OFFLINE"
          ? "OFFLINE"
          : ["MAINTENANCE", "METER_REPLACEMENT"].includes(scenario)
            ? "MAINTENANCE"
            : "ACTIVE"),
      "meter status",
    );
    check(
      gateway.status ===
        (scenario === "GATEWAY_OFFLINE" ? "OFFLINE" : "ONLINE"),
      "gateway status",
    );
    const meterApi = await api(`/api/meters/${id("electricity")}`, admin);
    check(meterApi.data.status === e.status, "meter API product status");
    const fleet = await api(
      `/api/devices/fleet?gatewayId=${id("gateway")}`,
      admin,
    );
    check(
      fleet.items.some(
        (d: { id: string; status: string }) =>
          d.id === id("device") &&
          d.status ===
            (["METER_OFFLINE", "GATEWAY_OFFLINE"].includes(scenario)
              ? "OFFLINE"
              : scenario === "MAINTENANCE"
                ? "MAINTENANCE"
                : "ONLINE"),
      ),
      "fleet reflects product status",
    );
    if (scenario === "GATEWAY_OFFLINE") {
      const health = await api(`/api/gateways/${id("gateway")}/health`, admin);
      check(
        health.reasons.includes("Gateway offline"),
        "gateway health product effect",
      );
    }
    if (scenario === "SUPPORT_CASE") {
      const support = await api("/api/support", admin);
      check(
        support.items.some((item: { id: string }) => item.id === id("support")),
        "support API product effect",
      );
    }
    if (scenario === "WATER_LEAK") {
      const water = await db.reading.findMany({
        where: { tenantId, meterId: id("water") },
      });
      check(
        water.length === 48 &&
          water.every((r) => r.consumption.toString() === "0.4"),
        "continuous water profile",
      );
    }
    if (["OPEN_ALARM", "ACKNOWLEDGED_ALARM", "WATER_LEAK"].includes(scenario)) {
      const alarm = await db.alarm.findUniqueOrThrow({
        where: { id: id("alarm") },
      });
      check(
        alarm.status ===
          (scenario === "ACKNOWLEDGED_ALARM" ? "ACKNOWLEDGED" : "OPEN"),
        "persisted alarm",
      );
    }
    if (["CRITICAL_ANOMALY", "WATER_LEAK"].includes(scenario))
      check(
        (
          await db.analyticsAnomaly.findUniqueOrThrow({
            where: { id: id("anomaly") },
          })
        ).severity === "CRITICAL",
        "critical anomaly",
      );
    if (scenario === "MAINTENANCE")
      check(
        (await db.workOrder.count({
          where: { tenantId, id: id("workorder"), type: "MAINTENANCE" },
        })) === 1,
        "maintenance workorder",
      );
    if (scenario === "METER_REPLACEMENT")
      check(
        (
          await db.meterReplacement.findUniqueOrThrow({
            where: { id: id("replacement-history") },
          })
        ).newMeterId === id("replacement"),
        "replacement history",
      );
    if (scenario === "SUPPORT_CASE")
      check(
        (await db.supportCase.count({
          where: { tenantId, id: id("support"), status: "OPEN" },
        })) === 1,
        "support case",
      );
    if (scenario === "FIRMWARE_ROLLOUT") {
      check(
        (
          await db.firmwareRollout.findUniqueOrThrow({
            where: { id: id("rollout") },
            include: { targets: true },
          })
        ).targets.length === 1,
        "rollout target",
      );
      check(
        (await db.gatewayCommand.count({
          where: { tenantId, deviceId: id("device") },
        })) === 0,
        "no delivery command",
      );
    }
    const query = new URLSearchParams({
      from: state.metadata.from,
      to: state.metadata.to,
      resolution: "hour",
      meterId: id("electricity"),
      timezone: "UTC",
    });
    const analytics = await api(`/api/analytics?${query}`, admin);
    check(
      analytics.totals.consumption ===
        (["HIGH_ELECTRICITY", "CRITICAL_ANOMALY"].includes(scenario)
          ? "960.000000"
          : scenario === "MISSING_DATA"
            ? "84.000000"
            : "96.000000"),
      "analytics reflects actual profile",
    );
    await api(`/api/analytics?${query}`, foreign, undefined, 404);
    await api(`/api/analytics?${query}`, user, undefined, 404);
    check(
      (await db.auditEvent.count({
        where: { tenantId, action: "demo.scenario.activated" },
      })) ===
        auditBefore + 1,
      "atomic audit",
    );
    await api("/api/platform/demo", platform, { action: "reset", tenantId });
    check(
      (await db.reading.count({
        where: { tenantId, meterId: id("electricity") },
      })) === 48,
      "reset restores gap",
    );
    check(
      (await db.alarm.count({ where: { tenantId, id: id("alarm") } })) === 0,
      "reset removes alarm",
    );
    check(
      (await db.meterReplacement.count({
        where: { tenantId, id: id("replacement-history") },
      })) === 0,
      "reset removes replacement",
    );
    results.push({ scenario, checks: checks - startChecks, status: "PASSED" });
    console.log(`PASS ${scenario}: ${checks - startChecks} checks`);
  }
  check(
    (await db.reading.count({ where: { tenantId: "demo-tenant-1" } })) ===
      otherBefore,
    "foreign tenant unchanged",
  );
  console.log(`PASS ${results.length} scenarios, ${checks} checks`);
} finally {
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  await writeFile(
    ".local/acceptance/demo-scenarios-result.json",
    JSON.stringify(
      { results, checks, completed: results.length === 13 },
      null,
      2,
    ),
  );
  await db.$disconnect();
}
