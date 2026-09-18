import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { db } from "../src/server/db";
if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Nur auf lokaler Demo-Umgebung ausführen.");
const base = process.env.APP_URL ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("HTTP-Tests benötigen localhost.");
const ids: string[] = [];
let count = 0;
async function session(userId: string, expired = false) {
  const token = randomBytes(32).toString("hex");
  const id = createHash("sha256").update(token).digest("hex");
  ids.push(id);
  await db.session.create({
    data: {
      id,
      userId,
      expiresAt: new Date(Date.now() + (expired ? -1000 : 300000)),
    },
  });
  return `meterwerk_session=${token}`;
}
async function status(
  path: string,
  expected: number,
  cookie?: string,
  init?: RequestInit,
) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...init?.headers },
  });
  assert.equal(
    res.status,
    expected,
    `${path}: expected ${expected}, got ${res.status}`,
  );
  count++;
  return res;
}
try {
  await status("/api/meters", 401);
  await status("/dashboard", 307);
  const tenant = await session("demo-tenant-0-user-0");
  const user = await session("demo-tenant-0-user-2");
  const platform = await session("platform-admin");
  const expired = await session("demo-tenant-0-user-0", true);
  await status("/api/meters", 401, expired);
  for (const section of [
    "dashboard",
    "properties",
    "buildings",
    "units",
    "meters",
    "users",
    "alarms",
    "settings",
  ]) {
    const response = await status(`/${section}`, 200, tenant);
    const html = await response.text();
    assert(
      !html.includes("Ansicht nicht verfügbar"),
      `${section} error boundary`,
    );
  }
  await status("/tenants", 200, platform);
  await status("/api/meters?tenantId=demo-tenant-1", 403, tenant);
  await status("/api/tenants", 403, tenant);
  await status("/api/users", 403, user);
  const foreign = await db.meter.findFirstOrThrow({
    where: { tenantId: "demo-tenant-1" },
  });
  await status(`/api/meters/${foreign.id}`, 404, tenant);
  await status("/api/meters", 400, platform);
  await status("/api/meters?tenantId=demo-tenant-1", 200, platform);
  const response = await status("/api/meters", 200, user);
  const payload = await response.json();
  assert.equal(
    payload.data.length,
    8 +
      Number(
        payload.data.some((m: { id: string }) => m.id === "demo-modbus-meter"),
      ),
  );
  assert(
    payload.data.every(
      (row: { tenantId: string }) => row.tenantId === "demo-tenant-0",
    ),
  );
  await status("/api/properties", 403, tenant, {
    method: "POST",
    headers: {
      origin: "https://foreign.invalid",
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Blocked", address: "x", city: "x" }),
  });
  await status("/api/properties", 403, user, {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ name: "Blocked", address: "x", city: "x" }),
  });
  await status("/api/buildings", 404, tenant, {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Blocked",
      propertyId: "demo-tenant-1-property-0",
    }),
  });
  await db.session.delete({ where: { id: ids[0] } });
  await status("/api/meters", 401, tenant);
  console.log(
    `${count} HTTP checks passed: pages, authentication, expiry, revocation, tenant isolation, USER grants, CSRF, write authorization.`,
  );
} finally {
  await db.session.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}
