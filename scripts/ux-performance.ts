import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { db } from "../src/server/db";
const base = process.env.APP_URL ?? "http://localhost:3000";
if (
  process.env.SEED_DEMO !== "true" ||
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname) ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Nur lokale Demo-Datenbank und localhost zulässig.");
const token = randomBytes(32).toString("hex");
const id = createHmac(
  "sha256",
  process.env.SESSION_SECRET ?? "development-session-secret",
)
  .update(token)
  .digest("hex");
try {
  await db.session.create({
    data: {
      id,
      userId: "demo-tenant-0-user-0",
      expiresAt: new Date(Date.now() + 300_000),
    },
  });
  const headers = { cookie: `meterwerk_session=${token}` };
  const measurements: Record<string, unknown> = {};
  for (const path of [
    "/dashboard?days=90",
    "/portfolio",
    "/meters",
    "/api/readings",
  ]) {
    await fetch(`${base}${path}`, { headers }).then((r) => r.text());
    const times: number[] = [];
    let html = "";
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const response = await fetch(`${base}${path}`, { headers });
      if (!response.ok)
        throw new Error(`Unerwarteter HTTP-Status: ${response.status}`);
      html = await response.text();
      times.push(Math.round(performance.now() - start));
    }
    const scripts = [
      ...new Set(
        [...html.matchAll(/src="([^" ]+\.js(?:\?[^" ]*)?)"/g)].map((m) => m[1]),
      ),
    ].filter((p) => p.startsWith("/_next/"));
    let jsBytes = 0,
      gzipBytes = 0;
    for (const src of scripts) {
      const response = await fetch(`${base}${src}`);
      const bytes = Buffer.from(new Uint8Array(await response.arrayBuffer()));
      jsBytes += bytes.length;
      gzipBytes += gzipSync(bytes).length;
    }
    measurements[path] = {
      warmMilliseconds: times,
      htmlBytes: Buffer.byteLength(html),
      initialScriptCount: scripts.length,
      jsBytes,
      gzipBytes,
    };
  }
  const meter = await db.meter.findFirstOrThrow({
    where: { tenantId: "demo-tenant-0" },
    select: { id: true },
  });
  const plan = await db.$queryRaw<
    Array<{ "QUERY PLAN": string }>
  >`EXPLAIN (ANALYZE, BUFFERS) SELECT "timestamp", "registerValue", "consumption" FROM "Reading" WHERE "tenantId" = ${"demo-tenant-0"} AND "meterId" = ${meter.id} ORDER BY "timestamp" DESC LIMIT 48`;
  console.log(
    JSON.stringify(
      {
        kind: "Local smoke measurement, not a load test",
        readings: await db.reading.count({
          where: { tenantId: "demo-tenant-0" },
        }),
        measurements,
        latestReadingsPlan: plan.map((row) =>
          row["QUERY PLAN"].replaceAll(meter.id, "<demo-meter>"),
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await db.session.deleteMany({ where: { id } });
  await db.$disconnect();
}
