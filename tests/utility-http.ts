import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { db } from "../src/server/db";
const base = process.env.APP_URL ?? "http://localhost:3000";
if (
  process.env.SEED_DEMO !== "true" ||
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname) ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Lokale Demo erforderlich.");
const actor = await db.user.findFirstOrThrow({
  where: { role: "SUPER_ADMIN", active: true },
  select: { id: true },
});
const token = randomBytes(32).toString("hex"),
  sessionId = createHash("sha256").update(token).digest("hex");
await db.session.create({
  data: {
    id: sessionId,
    userId: actor.id,
    expiresAt: new Date(Date.now() + 300000),
  },
});
try {
  const headers = { cookie: `meterwerk_session=${token}` };
  const dashboard = await fetch(
    `${base}/dashboard?tenantId=demo-multi-utility`,
    { headers },
  );
  const html = await dashboard.text();
  assert.equal(
    dashboard.status,
    200,
    `Dashboard status=${dashboard.status}; body=${html.slice(0, 500)}`,
  );
  for (const label of [
    "Strom",
    "Wasser",
    "Gas",
    "Wärme",
    "Medienübersicht",
    "UTC",
  ])
    assert(
      html.includes(label),
      `Dashboard missing ${label}; body=${html.slice(0, 500)}`,
    );
  for (const [utility, expected, absent] of [
    ["WATER", "Volumenzählerstand", "Spannung L1"],
    ["GAS", "Gasenergie", "Vorlauftemperatur"],
    ["HEAT", "Vorlauftemperatur", "Frequenz"],
    ["ELECTRICITY", "Spannung L1", "Vorlauftemperatur"],
  ]) {
    const response = await fetch(
      `${base}/meters/demo-multi-utility-${utility}?tenantId=demo-multi-utility`,
      { headers },
    );
    assert.equal(response.status, 200);
    const body = await response.text();
    assert(body.includes(expected));
    assert(!body.includes(absent));
    assert(body.includes("Geräteprofil und Kommunikation"));
    assert(body.includes("Zählerwechsel"));
  }
  const capabilityDevice = await db.device.findFirstOrThrow({
    where: {
      tenantId: "demo-multi-utility",
      meterId: "demo-multi-utility-WATER",
    },
    select: { id: true },
  });
  const capabilityResponse = await fetch(
    `${base}/api/devices/${capabilityDevice.id}/capability?tenantId=demo-multi-utility`,
    { headers },
  );
  assert.equal(capabilityResponse.status, 200);
  assert.equal((await capabilityResponse.json()).utility, "WATER");
  const unauthenticated = await fetch(
    `${base}/api/meters/demo-multi-utility-WATER/utility`,
  );
  assert.equal(unauthenticated.status, 401);
  const noTenant = await fetch(
    `${base}/api/meters/demo-multi-utility-WATER/utility`,
    { headers },
  );
  assert.equal(noTenant.status, 400);
  console.log(
    "12 multi-utility HTTP checks passed (dashboard, four profiles, capability UI/API, authentication, explicit tenant).",
  );
} finally {
  await db.session.delete({ where: { id: sessionId } });
  await db.$disconnect();
}
