import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { db } from "../src/server/db";
import {
  createPublicApiKey,
  revokePublicApiKey,
} from "../src/server/public-api";
import { processRuleActionJobs, runRulesWorkerOnce } from "../src/server/rules";
assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(process.env.EMAIL_PROVIDER, "local");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
const base = process.env.APP_URL!;
assert.equal(new URL(base).hostname, "127.0.0.1");
const actor = {
  id: "demo-tenant-0-user-0",
  tenantId: "demo-tenant-0",
  role: "TENANT_ADMIN" as const,
  name: "Synthetic",
  email: "synthetic@example.invalid",
};
const token = randomBytes(32).toString("hex");
const sessionId = createHmac("sha256", process.env.SESSION_SECRET!)
  .update(token)
  .digest("hex");
await db.session.create({
  data: {
    id: sessionId,
    userId: actor.id,
    expiresAt: new Date(Date.now() + 3600000),
  },
});
const key = await createPublicApiKey(actor, {
  name: "Local performance acceptance",
  scopes: ["meters:read"],
});
const results: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  environment:
    "Windows 11 / Node 24.19 / PostgreSQL 17.10 loopback / Next production build; synthetic seed; sequential warm requests; not production capacity",
};
async function request(path: string, publicKey = false) {
  const response = await fetch(base + path, {
    headers: publicKey
      ? { authorization: `Bearer ${key.token}` }
      : { cookie: `meterwerk_session=${token}` },
  });
  assert.equal(response.status, 200, path);
  const body = await response.text();
  assert(!body.includes("Ansicht nicht verfügbar"), path);
}
try {
  const state = await db.demoScenarioState.findUniqueOrThrow({
    where: {
      environment_tenantId: { environment: "test", tenantId: actor.tenantId },
    },
  });
  const to = state.activatedAt.toISOString();
  const from = new Date(
    state.activatedAt.getTime() - 48 * 3600000,
  ).toISOString();
  const paths: Record<string, () => Promise<unknown>> = {
    dashboard: () => request("/dashboard"),
    readings: () => request("/api/readings"),
    analytics: () =>
      request(
        `/api/analytics?from=${from}&to=${to}&resolution=hour&meterId=scenario-demo-tenant-0-electricity`,
      ),
    publicApi: () => request("/api/public/v1/meters", true),
    fleet: () => request("/api/devices/fleet"),
    queueClaim: () => processRuleActionJobs(new Date(), 1),
    worker: () => runRulesWorkerOnce(),
  };
  for (const [name, fn] of Object.entries(paths)) {
    await fn(); // Warmup excluded from the measurements below.
    const times: number[] = [];
    let errors = 0;
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      try {
        await fn();
      } catch {
        errors++;
      }
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    results[name] = {
      requests: 30,
      errors,
      errorRate: errors / 30,
      p50Ms: times[14],
      p95Ms: times[28],
      pathType: ["queueClaim", "worker"].includes(name)
        ? "real DB worker cycle (idle queue)"
        : "authenticated HTTP",
    };
    console.log(name, results[name]);
  }
} finally {
  await revokePublicApiKey(actor, key.id);
  await db.session.delete({ where: { id: sessionId } });
  await writeFile(
    ".local/acceptance/performance-results.json",
    JSON.stringify(results, null, 2),
  );
  await db.$disconnect();
}
