import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import { db } from "../src/server/db";
import {
  createPublicApiKey,
  revokePublicApiKey,
} from "../src/server/public-api";
if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Nur auf lokaler Demo-Umgebung ausführen.");
const base = process.env.APP_URL ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("HTTP-Tests benötigen localhost.");
const ids: string[] = [];
let publicApiKeyId: string | null = null;
let apiKeyFromRouteId: string | null = null;
let importedPropertyName: string | null = null;
let importedBatchId: string | null = null;
const bulkReadingIds: string[] = [];
const bulkFindingIds: string[] = [];
let count = 0;
async function session(userId: string, expired = false) {
  const token = randomBytes(32).toString("hex");
  const id = createHmac(
    "sha256",
    process.env.SESSION_SECRET ?? "development-session-secret",
  )
    .update(token)
    .digest("hex");
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
    `${path}: expected ${expected}, got ${res.status}: ${await res.clone().text()}`,
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
  const publicApiKey = await createPublicApiKey(
    {
      id: "demo-tenant-0-user-0",
      tenantId: "demo-tenant-0",
      role: "TENANT_ADMIN",
      name: "HTTP Tenant Admin",
      email: "http@example.invalid",
    },
    { name: "HTTP test key", scopes: ["properties:read"] },
  );
  publicApiKeyId = publicApiKey.id;
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
    "billing",
    "data-quality",
  ]) {
    const response = await status(`/${section}`, 200, tenant);
    const html = await response.text();
    assert(
      !html.includes("Ansicht nicht verfügbar"),
      `${section} error boundary`,
    );
  }
  await status("/imports", 200, tenant);
  const exportQuery = "from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z";
  await status(`/api/data-management/export?${exportQuery}`, 401);
  await status("/api/imports/history", 401);
  await status("/api/imports/history", 403, user);
  await status("/api/imports/history?tenantId=demo-tenant-1", 403, tenant);
  await status("/api/imports/history", 400, platform);
  await status(
    `/api/data-management/export?${exportQuery}&tenantId=demo-tenant-1`,
    403,
    tenant,
  );
  await status(`/api/data-management/export?${exportQuery}`, 400, platform);
  await status(
    `/api/data-management/export?${exportQuery}&meterId=missing-meter`,
    404,
    tenant,
  );
  await status(
    "/api/data-management/export?from=invalid&to=invalid",
    400,
    tenant,
  );
  const download = await status(
    `/api/data-management/export?${exportQuery}`,
    200,
    tenant,
  );
  assert.ok(download.headers.get("content-type")?.includes("text/csv"));
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.ok((await download.text()).startsWith('"id";"meterId"'));
  for (const route of [
    "/api/data-quality/bulk",
    "/api/imports/missing/errors",
  ]) {
    const json = {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        action: "SET_STATUS",
        ids: ["missing"],
        status: "INVALID",
        rows: [2],
        reason: "HTTP security verification",
      }),
    };
    await status(route, 401, undefined, json);
    await status(route, 403, user, json);
    await status(route, 403, tenant, {
      ...json,
      headers: { ...json.headers, origin: "https://foreign.invalid" },
    });
    await status(route, 404, tenant, json);
    await status(route, 403, tenant, {
      ...json,
      body: JSON.stringify({ tenantId: "demo-tenant-1" }),
    });
  }
  const userImportPage = await status("/imports", 200, user);
  assert(
    !(await userImportPage.text()).includes("CSV-Datenimport"),
    "USER must not receive the import page",
  );
  importedPropertyName = `HTTP import ${randomBytes(4).toString("hex")}`;
  const importForm = new FormData();
  importForm.set("tenantId", "demo-tenant-0");
  importForm.set("resource", "properties");
  importForm.set(
    "mapping",
    JSON.stringify({ name: "name", address: "address", city: "city" }),
  );
  importForm.set(
    "file",
    new File(
      [
        `name;address;city\n${importedPropertyName};HTTP 1;Berlin\n;HTTP 2;Berlin\n;HTTP 3;Berlin\n`,
      ],
      "properties.csv",
      { type: "text/csv" },
    ),
  );
  const importPreviewResponse = await status(
    "/api/imports/preview",
    201,
    tenant,
    {
      method: "POST",
      headers: { origin: base },
      body: importForm,
    },
  );
  const importPreview = await importPreviewResponse.json();
  importedBatchId = String(importPreview.id);
  assert.equal(importPreview.canConfirm, false);
  const skippedImport = await status(
    `/api/imports/${encodeURIComponent(importPreview.id)}/errors`,
    200,
    tenant,
    {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        rows: [3, 4],
        reason: "HTTP Fehlerzeilen gesammelt auslassen",
      }),
    },
  );
  const skippedBody = await skippedImport.json();
  assert.equal(skippedBody.canConfirm, true);
  assert.equal(skippedBody.skippedCount, 2);
  await status(
    `/api/imports/${encodeURIComponent(importPreview.id)}/confirm`,
    200,
    tenant,
    {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "demo-tenant-0" }),
    },
  );
  await status("/tenants", 200, platform);
  const importsHistory = await status("/api/imports/history", 200, tenant);
  const importHistoryBody = await importsHistory.json();
  const historicalImport = importHistoryBody.items.find(
    (item: { id: string }) => item.id === importedBatchId,
  );
  assert.equal(historicalImport.fileName, "properties.csv");
  assert.equal(historicalImport.successCount, 1);
  assert.equal(historicalImport.skippedCount, 2);
  assert.equal(historicalImport.status, "COMPLETED");
  assert.equal("stagedData" in historicalImport, false);
  const bulkMeter = await db.meter.findFirstOrThrow({
    where: { tenantId: "demo-tenant-0" },
    select: { id: true, measurementUnit: true },
  });
  for (let index = 0; index < 2; index++) {
    const reading = await db.reading.create({
      data: {
        tenantId: "demo-tenant-0",
        meterId: bulkMeter.id,
        timestamp: new Date(Date.now() - index * 1000),
        registerValue: "100",
        consumption: "1",
        measurementUnit: bulkMeter.measurementUnit,
        source: "MANUAL",
      },
    });
    bulkReadingIds.push(reading.id);
    const finding = await db.dataQualityFinding.create({
      data: {
        tenantId: "demo-tenant-0",
        meterId: bulkMeter.id,
        readingId: reading.id,
        type: "UNUSUAL_JUMP",
        status: "WARNING",
        fingerprint: `http-${reading.id}`,
        description: "HTTP fixture",
        windowFrom: new Date("2026-01-01T00:00:00Z"),
        windowTo: new Date("2027-01-01T00:00:00Z"),
      },
    });
    bulkFindingIds.push(finding.id);
  }
  const bulkRequest = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const bulkPayload = {
    action: "SET_STATUS",
    ids: bulkReadingIds,
    status: "SUSPECT",
    reason: "HTTP Sammelstatus fachlich prüfen",
  };
  const invalidBulk = await status(
    "/api/data-quality/bulk",
    404,
    tenant,
    bulkRequest({
      ...bulkPayload,
      ids: [bulkReadingIds[0], "missing-reading"],
    }),
  );
  assert.ok((await invalidBulk.json()).error);
  assert.equal(
    await db.dataQualityCorrection.count({
      where: { readingId: { in: bulkReadingIds } },
    }),
    0,
  );
  const bulkResult = await status(
    "/api/data-quality/bulk",
    200,
    tenant,
    bulkRequest(bulkPayload),
  );
  assert.equal((await bulkResult.json()).affected, 2);
  const ackResult = await status(
    "/api/data-quality/bulk",
    200,
    tenant,
    bulkRequest({
      action: "ACKNOWLEDGE",
      ids: bulkFindingIds,
      reason: "HTTP Befunde gemeinsam bestätigen",
    }),
  );
  assert.equal((await ackResult.json()).affected, 2);
  assert.equal(
    await db.dataQualityFinding.count({
      where: {
        id: { in: bulkFindingIds },
        acknowledgedBy: "demo-tenant-0-user-0",
        resolvedAt: null,
      },
    }),
    2,
  );
  await status("/dashboard", 200, platform);
  await status("/dashboard?tenantId=demo-tenant-1", 200, platform);
  const firstLogin = await status("/login", 200);
  const secondLogin = await status("/login", 200);
  const firstPolicy = firstLogin.headers.get("content-security-policy") ?? "";
  const secondPolicy = secondLogin.headers.get("content-security-policy") ?? "";
  assert(firstPolicy.includes("'strict-dynamic'"));
  assert(firstPolicy.includes("'nonce-"));
  assert.notEqual(
    firstPolicy,
    secondPolicy,
    "CSP nonce must be fresh per response",
  );
  await status("/api/meters?tenantId=demo-tenant-1", 403, tenant);
  await status("/api/tenants", 403, tenant);
  await status("/api/billing?tenantId=demo-tenant-0", 200, tenant);
  await status("/api/billing?tenantId=demo-tenant-1", 403, tenant);
  await status("/api/billing?tenantId=demo-tenant-0", 403, user);
  await status("/api/billing", 400, platform);
  await status("/api/billing?tenantId=demo-tenant-0", 200, platform);
  await status("/api/api-keys?tenantId=demo-tenant-0", 200, tenant);
  await status("/api/api-keys?tenantId=demo-tenant-1", 403, tenant);
  await status("/api/api-keys?tenantId=demo-tenant-0", 403, user);
  const superKeys = await status(
    "/api/api-keys?tenantId=demo-tenant-0",
    200,
    platform,
  );
  const superKeyRows = await superKeys.json();
  assert.equal("keyHash" in superKeyRows[0], false);
  assert.equal("token" in superKeyRows[0], false);
  const createdKey = await status("/api/api-keys", 201, tenant, {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({
      tenantId: "demo-tenant-0",
      name: "HTTP route key",
      description: "Scope management test",
      scopes: ["properties:read", "readings:read"],
    }),
  });
  const createdKeyBody = await createdKey.json();
  const createdRouteKeyId = String(createdKeyBody.id);
  apiKeyFromRouteId = createdRouteKeyId;
  assert.ok(createdKeyBody.token.startsWith("mwk_pub_"));
  assert.deepEqual(createdKeyBody.scopes, ["properties:read", "readings:read"]);
  await status("/api/api-keys", 403, platform, {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({
      tenantId: "demo-tenant-0",
      name: "Forbidden SUPER_ADMIN key",
      scopes: ["properties:read"],
    }),
  });
  await status(
    `/api/api-keys?id=${encodeURIComponent(createdRouteKeyId)}&tenantId=demo-tenant-0`,
    200,
    tenant,
    { method: "DELETE" },
  );
  await status("/api/webhooks?tenantId=demo-tenant-0", 200, tenant);
  const superWebhooks = await status(
    "/api/webhooks?tenantId=demo-tenant-0",
    200,
    platform,
  );
  const superWebhookData = await superWebhooks.json();
  assert.equal(
    "secretCiphertext" in (superWebhookData.endpoints[0] ?? {}),
    false,
  );
  await status("/api/webhooks?tenantId=demo-tenant-1", 403, tenant);
  await status("/api/webhooks", 403, platform, {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({
      tenantId: "demo-tenant-0",
      name: "Forbidden SUPER_ADMIN webhook",
      url: "https://hooks.example.invalid/meterwerk",
      events: ["alarm.created"],
    }),
  });
  await status("/api/webhooks", 403, tenant, {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({
      tenantId: "demo-tenant-0",
      name: "Plan-disabled webhook",
      url: "https://hooks.example.invalid/meterwerk",
      events: ["alarm.created"],
    }),
  });
  const diagnosticPage = await status(
    "/webhooks?tenantId=demo-tenant-0",
    200,
    platform,
  );
  const diagnosticHtml = await diagnosticPage.text();
  assert.equal(diagnosticHtml.includes("secretCiphertext"), false);
  assert.equal(diagnosticHtml.includes("mwk_whsec_"), false);
  assert.equal(diagnosticHtml.includes("mwk_pub_"), false);
  const apiDiagnosticPage = await status(
    "/api-keys?tenantId=demo-tenant-0",
    200,
    platform,
  );
  const apiDiagnosticHtml = await apiDiagnosticPage.text();
  assert.equal(apiDiagnosticHtml.includes("keyHash"), false);
  assert.equal(apiDiagnosticHtml.includes("mwk_pub_"), false);
  await status(
    "/api/webhooks/nonexistent/test?tenantId=demo-tenant-0",
    403,
    platform,
    {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  await status(
    "/api/webhooks/nonexistent/test?tenantId=demo-tenant-0",
    403,
    tenant,
    {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const publicResponse = await status(
    "/api/public/v1/properties?limit=1",
    200,
    undefined,
    {
      headers: {
        authorization: `Bearer ${publicApiKey.token}`,
        "x-correlation-id": "http-public-api-001",
      },
    },
  );
  assert.equal(
    publicResponse.headers.get("x-correlation-id"),
    "http-public-api-001",
  );
  const publicPayload = await publicResponse.json();
  assert.equal(publicPayload.data.length, 1);
  assert.equal(publicPayload.correlationId, "http-public-api-001");
  await status("/api/public/v1/properties", 401);
  await status("/api/public/v1/meters", 403, undefined, {
    headers: { authorization: `Bearer ${publicApiKey.token}` },
  });
  await status(
    "/api/public/v1/properties?tenantId=demo-tenant-1",
    403,
    undefined,
    { headers: { authorization: `Bearer ${publicApiKey.token}` } },
  );
  await revokePublicApiKey(
    {
      id: "demo-tenant-0-user-0",
      tenantId: "demo-tenant-0",
      role: "TENANT_ADMIN",
      name: "HTTP Tenant Admin",
      email: "http@example.invalid",
    },
    publicApiKey.id,
  );
  await status("/api/public/v1/properties", 401, undefined, {
    headers: { authorization: `Bearer ${publicApiKey.token}` },
  });
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
  await db.dataQualityCorrection.deleteMany({
    where: { readingId: { in: bulkReadingIds } },
  });
  await db.dataQualityFinding.deleteMany({
    where: { id: { in: bulkFindingIds } },
  });
  await db.auditEvent.deleteMany({
    where: {
      tenantId: "demo-tenant-0",
      entityId: { in: [...bulkReadingIds, ...bulkFindingIds] },
    },
  });
  await db.reading.deleteMany({
    where: { id: { in: bulkReadingIds }, tenantId: "demo-tenant-0" },
  });
  if (importedPropertyName) {
    const imported = await db.property.findFirst({
      where: { tenantId: "demo-tenant-0", name: importedPropertyName },
      select: { id: true },
    });
    if (imported) await db.property.delete({ where: { id: imported.id } });
    await db.auditEvent.deleteMany({
      where: { tenantId: "demo-tenant-0", entityId: importedBatchId ?? "" },
    });
    await db.dataImport.deleteMany({
      where: { id: importedBatchId ?? "", tenantId: "demo-tenant-0" },
    });
  }
  if (publicApiKeyId) {
    await db.auditEvent.deleteMany({
      where: {
        entityId: publicApiKeyId,
        action: { startsWith: "public_api_key." },
      },
    });
    await db.publicApiKey.deleteMany({ where: { id: publicApiKeyId } });
  }
  if (apiKeyFromRouteId) {
    await db.auditEvent.deleteMany({
      where: {
        entityId: apiKeyFromRouteId,
        action: { startsWith: "public_api_key." },
      },
    });
    await db.publicApiKey.deleteMany({ where: { id: apiKeyFromRouteId } });
  }
  await db.session.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}
