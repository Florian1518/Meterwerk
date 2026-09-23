import "server-only";
import { z } from "zod";
import { db } from "./db";
import { AccessError, tenantScope, type Actor } from "./policy";
const subscriptionSchema = z
  .object({
    endpoint: z.string().url().max(2000),
    keys: z
      .object({
        p256dh: z.string().min(1).max(500),
        auth: z.string().min(1).max(500),
      })
      .strict(),
  })
  .strict();
export async function savePushSubscription(
  actor: Actor,
  requested: string | null,
  raw: unknown,
) {
  const tenantId = tenantScope(actor, requested);
  const value = subscriptionSchema.parse(raw);
  if (!actor.tenantId || actor.tenantId !== tenantId)
    throw new AccessError(403, "Push-Abo nur im eigenen Tenant.");
  return db.pushSubscription.upsert({
    where: { tenantId_endpoint: { tenantId, endpoint: value.endpoint } },
    create: {
      tenantId,
      userId: actor.id,
      endpoint: value.endpoint,
      key: value.keys.p256dh,
      auth: value.keys.auth,
    },
    update: {
      userId: actor.id,
      key: value.keys.p256dh,
      auth: value.keys.auth,
      revokedAt: null,
    },
  });
}
export async function revokePushSubscription(
  actor: Actor,
  requested: string | null,
  endpoint: string,
) {
  const tenantId = tenantScope(actor, requested);
  await db.pushSubscription.updateMany({
    where: { tenantId, userId: actor.id, endpoint },
    data: { revokedAt: new Date() },
  });
  return { revoked: true };
}
export const pushEvents = [
  "CRITICAL_ALARM",
  "METER_OFFLINE",
  "GATEWAY_OFFLINE",
  "REPORT_READY",
] as const;
