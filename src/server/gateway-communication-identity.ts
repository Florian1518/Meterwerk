import "server-only";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, requirePlatform, tenantScope } from "./policy";

// References are identifiers, not URLs, PEM blobs or arbitrary provider payloads.
const reference = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const metadata = z
  .object({
    brokerReference: reference,
    certificateFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    issuerReference: reference,
    serialNumber: z.string().regex(/^[0-9a-f]{1,80}$/),
    notBefore: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export async function registerGatewayCommunicationIdentity(
  gatewayId: string,
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requirePlatform(actor);
  const tenantId = tenantScope(actor, requested);
  const value = metadata.parse(raw);
  const notBefore = new Date(value.notBefore),
    expiresAt = new Date(value.expiresAt);
  if (notBefore >= expiresAt || expiresAt <= new Date())
    throw new AccessError(400, "Ungültiger Zertifikatszeitraum.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Gateway" WHERE "id"=${gatewayId} AND "tenantId"=${tenantId} FOR UPDATE`;
    const gateway = await tx.gateway.findFirst({
      where: { id: gatewayId, tenantId },
      select: { lifecycleStatus: true },
    });
    if (!gateway) throw new AccessError(404, "Gateway nicht gefunden.");
    if (gateway.lifecycleStatus === "DECOMMISSIONED")
      throw new AccessError(409, "Gateway ist stillgelegt.");
    const row = await tx.gatewayCommunicationIdentity.create({
      data: {
        ...value,
        notBefore,
        expiresAt,
        gatewayId,
        tenantId,
        commonName: gatewayId,
      },
      select: { id: true, certificateFingerprint: true },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: gatewayId,
        action: "gateway.communication-identity.register",
        details: {
          identityId: row.id,
          certificateFingerprint: row.certificateFingerprint,
          brokerStatus: "UNVERIFIED",
        },
      },
    });
    return row;
  });
}
