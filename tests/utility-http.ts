import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
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
  sessionId = createHmac(
    "sha256",
    process.env.SESSION_SECRET ?? "development-session-secret",
  )
    .update(token)
    .digest("hex");
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
  const portfolioResponse = await fetch(
    `${base}/api/portfolio?tenantId=demo-multi-utility`,
    { headers },
  );
  assert.equal(portfolioResponse.status, 200);
  const portfolio = await portfolioResponse.json();
  assert.equal(portfolio.byUtility.length, 4);
  const portfolioPage = await fetch(
    `${base}/portfolio?tenantId=demo-multi-utility`,
    { headers },
  );
  assert.equal(portfolioPage.status, 200);
  assert((await portfolioPage.text()).includes("Portfolioübersicht"));
  const reportResponse = await fetch(
    `${base}/api/reports?tenantId=demo-multi-utility`,
    {
      headers: { ...headers, origin: base, "content-type": "application/json" },
      method: "POST",
      body: JSON.stringify({
        type: "MONTHLY",
        title: "HTTP Testbericht",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-02-01T00:00:00.000Z",
        filters: {},
      }),
    },
  );
  assert.equal(reportResponse.status, 201);
  const report = await reportResponse.json();
  const pdfResponse = await fetch(
    `${base}/api/reports/${report.id}/export?format=pdf&tenantId=demo-multi-utility`,
    { headers },
  );
  assert.equal(pdfResponse.status, 200);
  assert.equal((await pdfResponse.text()).slice(0, 8), "%PDF-1.4");
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
    "18 customer-portal HTTP checks passed (dashboard, portfolio, reports, PDF, profiles, capability, authentication, explicit tenant).",
  );
} finally {
  await db.session.delete({ where: { id: sessionId } });
  await db.$disconnect();
}
