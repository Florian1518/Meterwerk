import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { requireTenantFeature } from "./licensing";
import { AccessError, tenantScope, type Actor } from "./policy";

export const webhookEvents = [
  "meter.reading.received",
  "meter.offline",
  "meter.online",
  "gateway.offline",
  "gateway.online",
  "alarm.created",
  "alarm.acknowledged",
  "alarm.resolved",
  "report.ready",
] as const;
export type WebhookEvent = (typeof webhookEvents)[number];
const maxAttempts = 8;
const lockMs = 30_000;

function encryptionKey() {
  const value = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  if (
    process.env.NODE_ENV === "production" &&
    (!value || Buffer.byteLength(value, "utf8") < 32)
  )
    throw new Error(
      "WEBHOOK_SECRET_ENCRYPTION_KEY muss in Produktion mindestens 32 Bytes lang sein.",
    );
  const source =
    value ?? process.env.SESSION_SECRET ?? "meterwerk-local-webhook-key";
  return createHmac("sha256", "meterwerk-webhook-encryption-v1")
    .update(source)
    .digest();
}

function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return {
    secretCiphertext: ciphertext.toString("base64url"),
    secretIv: iv.toString("base64url"),
    secretTag: cipher.getAuthTag().toString("base64url"),
  };
}

function decryptSecret(value: {
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
}) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(value.secretIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(value.secretTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.secretCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && (b === 0 || b === 2 || b === 168)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      a! >= 224
    );
  }
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return true;
  return (
    (!normalized.startsWith("2") && !normalized.startsWith("3")) ||
    normalized.startsWith("2001:db8:")
  );
}

export function validateWebhookUrl(raw: string) {
  const url = new URL(raw);
  if (url.username || url.password || url.hash)
    throw new AccessError(
      400,
      "Webhook-URL darf keine Zugangsdaten oder Fragmente enthalten.",
    );
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new AccessError(
      400,
      "Webhook-URLs müssen in Produktion HTTPS verwenden.",
    );
  if (
    url.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && url.protocol === "http:")
  )
    throw new AccessError(400, "Webhook-URL muss HTTP oder HTTPS sein.");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    (isIP(host) !== 0 && isPrivateAddress(host))
  )
    throw new AccessError(
      400,
      "Lokale und private Ziele sind für Webhooks nicht zulässig.",
    );
  return url.toString();
}

const webhookInput = z
  .object({
    tenantId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(120),
    url: z.string().url().max(2000),
    events: z.array(z.enum(webhookEvents)).min(1).max(webhookEvents.length),
    active: z.boolean().default(true),
  })
  .strict();

function requireWebhookReader(actor: Actor) {
  if (actor.role !== "TENANT_ADMIN" && actor.role !== "SUPER_ADMIN")
    throw new AccessError(403, "Keine Berechtigung für Webhook-Diagnosen.");
}

function requireWebhookManager(actor: Actor) {
  if (actor.role !== "TENANT_ADMIN")
    throw new AccessError(
      403,
      "Webhooks dürfen nur Kundenadministratoren verwalten.",
    );
}

export async function createWebhook(actor: Actor, raw: unknown) {
  requireWebhookManager(actor);
  const value = webhookInput.parse(raw);
  const tenantId = tenantScope(actor, value.tenantId);
  await requireTenantFeature(tenantId, "WEBHOOKS");
  const url = validateWebhookUrl(value.url);
  const secret = `mwk_whsec_${randomBytes(32).toString("base64url")}`;
  const encrypted = encryptSecret(secret);
  const endpoint = await db.$transaction(async (tx) => {
    const created = await tx.webhookEndpoint.create({
      data: {
        tenantId,
        name: value.name,
        url,
        events: [...new Set(value.events)],
        active: value.active,
        ...encrypted,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        lastDeliveryAt: true,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "webhook.created",
        entityId: created.id,
      },
    });
    return created;
  });
  return { ...endpoint, secret };
}

export async function listWebhooks(actor: Actor, requested?: string | null) {
  requireWebhookReader(actor);
  const tenantId = tenantScope(actor, requested);
  const [endpoints, deliveries] = await Promise.all([
    db.webhookEndpoint.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        lastDeliveryAt: true,
      },
    }),
    db.webhookDelivery.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        webhookId: true,
        event: true,
        eventId: true,
        status: true,
        attempts: true,
        statusCode: true,
        error: true,
        createdAt: true,
        lastAttemptAt: true,
      },
    }),
  ]);
  return { endpoints, deliveries };
}

export async function updateWebhook(
  actor: Actor,
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  requireWebhookManager(actor);
  const tenantId = tenantScope(actor, requested);
  const value = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      url: z.string().url().max(2000).optional(),
      events: z
        .array(z.enum(webhookEvents))
        .min(1)
        .max(webhookEvents.length)
        .optional(),
      active: z.boolean().optional(),
    })
    .strict()
    .parse(raw);
  if (value.active === true) await requireTenantFeature(tenantId, "WEBHOOKS");
  if (value.url) validateWebhookUrl(value.url);
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.webhookEndpoint.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: value,
    });
    if (!updated.count) throw new AccessError(404, "Webhook nicht gefunden.");
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "webhook.updated",
        entityId: id,
      },
    });
    return tx.webhookEndpoint.findFirstOrThrow({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        lastDeliveryAt: true,
      },
    });
  });
  return result;
}

export async function deleteWebhook(
  actor: Actor,
  id: string,
  requested?: string | null,
) {
  requireWebhookManager(actor);
  const tenantId = tenantScope(actor, requested);
  return db.$transaction(async (tx) => {
    const deleted = await tx.webhookEndpoint.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { active: false, deletedAt: new Date() },
    });
    if (!deleted.count) throw new AccessError(404, "Webhook nicht gefunden.");
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "webhook.deleted",
        entityId: id,
      },
    });
    return { id, deleted: true };
  });
}

export async function queueWebhookTest(
  actor: Actor,
  id: string,
  requested?: string | null,
) {
  requireWebhookManager(actor);
  const tenantId = tenantScope(actor, requested);
  await requireTenantFeature(tenantId, "WEBHOOKS");
  const endpoint = await db.webhookEndpoint.findFirst({
    where: { id, tenantId, active: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!endpoint) throw new AccessError(404, "Aktiver Webhook nicht gefunden.");
  const deliveryId = randomUUID();
  await db.$transaction(async (tx) => {
    await tx.webhookDelivery.create({
      data: {
        id: deliveryId,
        tenantId,
        webhookId: endpoint.id,
        event: "webhook.test",
        eventId: deliveryId,
        payload: {
          id: deliveryId,
          event: "webhook.test",
          occurredAt: new Date().toISOString(),
          data: { test: true, webhookName: endpoint.name },
        },
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "webhook.test_queued",
        entityId: endpoint.id,
      },
    });
  });
  return { deliveryId, status: "PENDING" as const };
}

export async function enqueueWebhookEvent(
  tx: Prisma.TransactionClient,
  tenantId: string,
  event: WebhookEvent,
  data: Prisma.InputJsonValue,
) {
  const endpoints = await tx.webhookEndpoint.findMany({
    where: { tenantId, active: true, events: { has: event } },
    select: { id: true },
  });
  if (!endpoints.length) return null;
  const eventId = randomUUID();
  await tx.webhookDelivery.createMany({
    data: endpoints.map(({ id }) => ({
      tenantId,
      webhookId: id,
      event,
      eventId,
      payload: {
        id: eventId,
        event,
        occurredAt: new Date().toISOString(),
        data,
      },
      status: "PENDING",
    })),
  });
  return eventId;
}

export function signWebhook(
  secret: string,
  deliveryId: string,
  timestamp: string,
  body: string,
) {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${deliveryId}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export function verifyWebhookSignature(
  secret: string,
  deliveryId: string,
  signature: string,
  body: string,
  now = Date.now(),
  timestampHeader?: string,
) {
  const match = /^t=(\d{10}),v1=([0-9a-f]{64})$/.exec(signature);
  if (
    !match ||
    (timestampHeader !== undefined && timestampHeader !== match[1]) ||
    Math.abs(now - Number(match[1]) * 1000) > 5 * 60_000
  )
    return false;
  const expected = Buffer.from(
    signWebhook(secret, deliveryId, match[1]!, body).split("v1=")[1]!,
    "hex",
  );
  const actual = Buffer.from(match[2]!, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function resolvePublicTarget(url: URL) {
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("HTTPS required");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Private destination blocked");
    return;
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateAddress(address))
  )
    throw new Error("Private destination blocked");
}

async function claimNextWebhookDelivery(now = new Date()) {
  const candidates = await db.webhookDelivery.findMany({
    where: {
      nextAttemptAt: { lte: now },
      OR: [
        { status: { in: ["PENDING", "RETRYING"] } },
        { status: "PROCESSING", lockedUntil: { lte: now } },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: 20,
    select: { id: true, tenantId: true },
  });
  for (const candidate of candidates) {
    const claim = await db.webhookDelivery.updateMany({
      where: {
        ...candidate,
        nextAttemptAt: { lte: now },
        OR: [
          { status: { in: ["PENDING", "RETRYING"] } },
          { status: "PROCESSING", lockedUntil: { lte: now } },
        ],
      },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        lastAttemptAt: now,
        lockedUntil: new Date(now.getTime() + lockMs),
      },
    });
    if (claim.count)
      return db.webhookDelivery.findFirst({
        where: candidate,
        include: { webhook: true },
      });
  }
  return null;
}

function failureReason(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError")
    return "Request timed out";
  if (error instanceof Error && error.message === "Private destination blocked")
    return "Private destination blocked";
  if (error instanceof Error && error.message === "HTTPS required")
    return "HTTPS required";
  return "Connection failed";
}

export async function deliverNextWebhook(
  now = new Date(),
  adapters: {
    fetcher?: typeof fetch;
    resolveTarget?: (url: URL) => Promise<void>;
  } = {},
) {
  const delivery = await claimNextWebhookDelivery(now);
  if (!delivery) return false;
  if (!delivery.webhook.active) {
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "CANCELLED",
        error: "Webhook disabled",
        lockedUntil: null,
      },
    });
    return true;
  }
  try {
    await requireTenantFeature(delivery.tenantId, "WEBHOOKS");
  } catch {
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "RETRYING",
        error: "Webhook feature unavailable",
        nextAttemptAt: new Date(now.getTime() + 60_000),
        lockedUntil: null,
      },
    });
    return true;
  }
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const target = new URL(delivery.webhook.url);
    await (adapters.resolveTarget ?? resolvePublicTarget)(target);
    const body = JSON.stringify(delivery.payload);
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const signature = signWebhook(
      decryptSecret(delivery.webhook),
      delivery.id,
      timestamp,
      body,
    );
    const response = await (adapters.fetcher ?? fetch)(target, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      body,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Meterwerk-Webhooks/1",
        "X-Meterwerk-Event": delivery.event,
        "X-Meterwerk-Delivery": delivery.id,
        "X-Meterwerk-Timestamp": timestamp,
        "X-Meterwerk-Signature": signature,
      },
    });
    statusCode = response.status;
    if (!response.ok) error = `Receiver returned HTTP ${response.status}`;
  } catch (cause) {
    error = failureReason(cause);
  }
  const succeeded =
    statusCode !== null && statusCode >= 200 && statusCode < 300;
  const dead = !succeeded && delivery.attempts >= maxAttempts;
  const backoffMs = Math.min(
    3_600_000,
    2_000 * 2 ** Math.max(0, delivery.attempts - 1),
  );
  await db.$transaction(async (tx) => {
    await tx.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: succeeded ? "DELIVERED" : dead ? "DEAD_LETTER" : "RETRYING",
        statusCode,
        error,
        lockedUntil: null,
        ...(succeeded || dead
          ? {}
          : { nextAttemptAt: new Date(now.getTime() + backoffMs) }),
      },
    });
    await tx.webhookEndpoint.updateMany({
      where: { id: delivery.webhookId, tenantId: delivery.tenantId },
      data: { lastDeliveryAt: now },
    });
  });
  return true;
}

export const webhookRetryPolicy = { maxAttempts, lockMs } as const;
