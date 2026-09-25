import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { changePlan, setFeatureOverride } from "../src/server/licensing";
import { AccessError, type Actor } from "../src/server/policy";
import {
  createWebhook,
  deleteWebhook,
  deliverNextWebhook,
  enqueueWebhookEvent,
  listWebhooks,
  queueWebhookTest,
  signWebhook,
  updateWebhook,
  verifyWebhookSignature,
} from "../src/server/webhooks";

if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Lokale Demo-Datenbank erforderlich.");
const tenantId = `webhook-${randomUUID()}`;
const foreignTenantId = `webhook-${randomUUID()}`;
const platform: Actor = {
  id: "platform-admin",
  tenantId: null,
  role: "SUPER_ADMIN",
  name: "Platform",
  email: "platform@example.invalid",
};
const actor: Actor = {
  id: `${tenantId}-admin`,
  tenantId,
  role: "TENANT_ADMIN",
  name: "Tenant Admin",
  email: `${tenantId}@example.invalid`,
};
const foreignActor: Actor = {
  ...actor,
  id: `${foreignTenantId}-admin`,
  tenantId: foreignTenantId,
};
let checks = 0;
let secretForSigning = "";
async function check(name: string, run: () => Promise<void>) {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}

try {
  await db.tenant.createMany({
    data: [
      { id: tenantId, slug: tenantId, name: "Webhook test" },
      {
        id: foreignTenantId,
        slug: foreignTenantId,
        name: "Foreign webhook test",
      },
    ],
  });
  await changePlan(platform, { tenantId, plan: "ENTERPRISE" });
  await changePlan(platform, { tenantId: foreignTenantId, plan: "ENTERPRISE" });

  await check("secret is one-time shown and encrypted at rest", async () => {
    const created = await createWebhook(actor, {
      name: "Primary receiver",
      url: "https://hooks.example.com/meterwerk",
      events: ["meter.reading.received"],
    });
    secretForSigning = created.secret;
    const stored = await db.webhookEndpoint.findUniqueOrThrow({
      where: { id: created.id },
    });
    assert.ok(created.secret.startsWith("mwk_whsec_"));
    assert.notEqual(stored.secretCiphertext, created.secret);
    assert.equal(
      "secretCiphertext" in (await listWebhooks(actor)).endpoints[0]!,
      false,
    );
    const diagnostic = await listWebhooks(platform, tenantId);
    assert.equal("secretCiphertext" in diagnostic.endpoints[0]!, false);
    await assert.rejects(
      () =>
        createWebhook(platform, {
          tenantId,
          name: "Forbidden platform create",
          url: "https://forbidden.example.com/hooks",
          events: ["alarm.created"],
        }),
      { status: 403 },
    );
  });

  await check(
    "signed webhook verifies and rejects tampered or stale deliveries",
    async () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({ id: "evt_test", event: "alarm.created" });
      const signature = signWebhook("test_secret", "evt_test", timestamp, body);
      assert.equal(
        verifyWebhookSignature("test_secret", "evt_test", signature, body),
        true,
      );
      assert.equal(
        verifyWebhookSignature(
          "test_secret",
          "evt_test",
          signature,
          body,
          Date.now(),
          String(Number(timestamp) + 1),
        ),
        false,
      );
      assert.equal(
        verifyWebhookSignature("other_secret", "evt_test", signature, body),
        false,
      );
      assert.equal(
        verifyWebhookSignature("test_secret", "evt_other", signature, body),
        false,
      );
      assert.equal(
        verifyWebhookSignature(
          "test_secret",
          "evt_test",
          signature,
          body,
          Date.now() + 6 * 60_000,
        ),
        false,
      );
    },
  );

  await check(
    "successful delivery carries HMAC, timestamp and stable delivery ID",
    async () => {
      const endpoint = (await listWebhooks(actor)).endpoints[0]!;
      await db.$transaction((tx) =>
        enqueueWebhookEvent(tx, tenantId, "meter.reading.received", {
          meterId: "meter-1",
        }),
      );
      const now = new Date();
      let calls = 0;
      await deliverNextWebhook(now, {
        resolveTarget: async () => {},
        fetcher: async (_input, init) => {
          calls++;
          const headers = new Headers(init?.headers);
          const body = String(init?.body);
          const deliveryId = headers.get("X-Meterwerk-Delivery")!;
          assert.equal(
            headers.get("X-Meterwerk-Event"),
            "meter.reading.received",
          );
          assert.equal(
            headers.get("X-Meterwerk-Timestamp"),
            String(Math.floor(now.getTime() / 1000)),
          );
          assert.equal(
            verifyWebhookSignature(
              secretForSigning,
              deliveryId,
              headers.get("X-Meterwerk-Signature")!,
              body,
              now.getTime(),
              headers.get("X-Meterwerk-Timestamp")!,
            ),
            true,
          );
          return new Response(null, { status: 204 });
        },
      });
      await deliverNextWebhook(now, {
        resolveTarget: async () => {},
        fetcher: async () => {
          calls++;
          return new Response(null, { status: 200 });
        },
      });
      assert.equal(calls, 1);
      assert.ok(endpoint.id);
    },
  );

  await check(
    "tenant admin can queue a signed test event without receiving the secret again",
    async () => {
      const endpoint = (await listWebhooks(actor)).endpoints[0]!;
      const queued = await queueWebhookTest(actor, endpoint.id);
      const delivery = await db.webhookDelivery.findUniqueOrThrow({
        where: { id: queued.deliveryId },
      });
      assert.equal(delivery.event, "webhook.test");
      assert.equal(delivery.status, "PENDING");
      await assert.rejects(
        () => queueWebhookTest(platform, endpoint.id, tenantId),
        { status: 403 },
      );
      await deliverNextWebhook(new Date(), {
        resolveTarget: async () => {},
        fetcher: async (_input, init) => {
          const headers = new Headers(init?.headers);
          const body = String(init?.body);
          assert.equal(headers.get("X-Meterwerk-Event"), "webhook.test");
          assert.equal(
            verifyWebhookSignature(
              secretForSigning,
              queued.deliveryId,
              headers.get("X-Meterwerk-Signature")!,
              body,
            ),
            true,
          );
          return new Response(null, { status: 200 });
        },
      });
      assert.equal(
        (
          await db.webhookDelivery.findUniqueOrThrow({
            where: { id: queued.deliveryId },
          })
        ).status,
        "DELIVERED",
      );
    },
  );

  await check(
    "HTTP failures retry with exponential backoff, then succeed",
    async () => {
      await db.$transaction((tx) =>
        enqueueWebhookEvent(tx, tenantId, "meter.reading.received", {
          meterId: "retry",
        }),
      );
      const now = new Date();
      let deliveryId = "";
      await deliverNextWebhook(now, {
        resolveTarget: async () => {},
        fetcher: async (_input, init) => {
          deliveryId = new Headers(init?.headers).get("X-Meterwerk-Delivery")!;
          return new Response(null, { status: 503 });
        },
      });
      const retry = await db.webhookDelivery.findFirstOrThrow({
        where: {
          tenantId,
          event: "meter.reading.received",
          status: "RETRYING",
        },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(retry.attempts, 1);
      assert.equal(retry.nextAttemptAt.getTime(), now.getTime() + 2000);
      let retryDeliveryId = "";
      await deliverNextWebhook(new Date(now.getTime() + 2100), {
        resolveTarget: async () => {},
        fetcher: async (_input, init) => {
          retryDeliveryId = new Headers(init?.headers).get(
            "X-Meterwerk-Delivery",
          )!;
          return new Response(null, { status: 200 });
        },
      });
      const complete = await db.webhookDelivery.findUniqueOrThrow({
        where: { id: retry.id },
      });
      assert.equal(complete.status, "DELIVERED");
      assert.equal(complete.statusCode, 200);
      assert.equal(retryDeliveryId, deliveryId);
    },
  );

  await check(
    "timeout records a safe reason without request secrets",
    async () => {
      await db.$transaction((tx) =>
        enqueueWebhookEvent(tx, tenantId, "meter.reading.received", {
          meterId: "timeout",
        }),
      );
      const now = new Date(Date.now() + 30_000);
      await deliverNextWebhook(now, {
        resolveTarget: async () => {},
        fetcher: async () => {
          throw new DOMException("secret must not be recorded", "TimeoutError");
        },
      });
      const timeout = await db.webhookDelivery.findFirstOrThrow({
        where: { tenantId, status: "RETRYING", error: "Request timed out" },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(timeout.statusCode, null);
      assert.ok(!timeout.error?.includes("secret"));
    },
  );

  await check("inactive webhook is cancelled without sending", async () => {
    const endpoint = await createWebhook(actor, {
      name: "Disable before send",
      url: "https://disabled.example.com/hooks",
      events: ["alarm.created"],
    });
    const eventId = await db.$transaction((tx) =>
      enqueueWebhookEvent(tx, tenantId, "alarm.created", {
        alarmId: "disabled",
      }),
    );
    const delivery = await db.webhookDelivery.findFirstOrThrow({
      where: { webhookId: endpoint.id, eventId: eventId! },
    });
    await updateWebhook(actor, endpoint.id, { active: false });
    let calls = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      const current = await db.webhookDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
      });
      if (current.status === "CANCELLED") break;
      await deliverNextWebhook(new Date(Date.now() + 60_000), {
        resolveTarget: async () => {},
        fetcher: async () => {
          calls++;
          return new Response(null, { status: 200 });
        },
      });
    }
    assert.equal(calls, 0);
    assert.equal(
      (
        await db.webhookDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        })
      ).status,
      "CANCELLED",
    );
  });

  await check(
    "delivery becomes dead-letter after the retry budget is exhausted",
    async () => {
      const endpoint = await createWebhook(actor, {
        name: "Dead-letter receiver",
        url: "https://dead-letter.example.com/hooks",
        events: ["report.ready"],
      });
      const eventId = await db.$transaction((tx) =>
        enqueueWebhookEvent(tx, tenantId, "report.ready", {
          reportId: "failed-report",
        }),
      );
      const delivery = await db.webhookDelivery.findFirstOrThrow({
        where: { webhookId: endpoint.id, eventId: eventId! },
      });
      let now = new Date(Date.now() + 2 * 60 * 60_000);
      for (let attempt = 0; attempt < 30; attempt++) {
        const current = await db.webhookDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        });
        if (current.status === "DEAD_LETTER") break;
        await deliverNextWebhook(now, {
          resolveTarget: async () => {},
          fetcher: async () => new Response(null, { status: 500 }),
        });
        now = new Date(now.getTime() + 2 * 60 * 60_000);
      }
      const dead = await db.webhookDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
      });
      assert.equal(dead.status, "DEAD_LETTER");
      assert.equal(dead.attempts, 8);
      assert.equal(dead.statusCode, 500);
    },
  );

  await check(
    "foreign-tenant IDs cannot be listed, updated, or deleted",
    async () => {
      const foreign = await createWebhook(foreignActor, {
        name: "Foreign endpoint",
        url: "https://foreign.example.com/hooks",
        events: ["alarm.created"],
      });
      assert.equal(
        (await listWebhooks(actor)).endpoints.some(
          (item) => item.id === foreign.id,
        ),
        false,
      );
      await assert.rejects(
        () => updateWebhook(actor, foreign.id, { active: false }),
        (error: unknown) =>
          error instanceof AccessError && error.status === 404,
      );
      await assert.rejects(
        () => deleteWebhook(actor, foreign.id),
        (error: unknown) =>
          error instanceof AccessError && error.status === 404,
      );
    },
  );

  await check(
    "tenant plan feature is enforced before endpoint creation",
    async () => {
      await setFeatureOverride(platform, {
        tenantId,
        feature: "WEBHOOKS",
        enabled: false,
      });
      await assert.rejects(
        () =>
          createWebhook(actor, {
            name: "Blocked endpoint",
            url: "https://blocked.example.com/hooks",
            events: ["alarm.created"],
          }),
        { status: 403 },
      );
      assert.equal(
        await db.webhookEndpoint.count({
          where: { tenantId, name: "Blocked endpoint" },
        }),
        0,
      );
    },
  );

  console.log(`${checks} webhook integration checks passed.`);
} finally {
  await db.auditEvent.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.webhookDelivery.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.webhookEndpoint.deleteMany({
    where: { tenantId: { in: [tenantId, foreignTenantId] } },
  });
  await db.tenant.deleteMany({
    where: { id: { in: [tenantId, foreignTenantId] } },
  });
  await db.$disconnect();
}
