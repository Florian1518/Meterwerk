import "server-only";
import {
  generateKeyPairSync,
  createHash,
  createPublicKey,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import {
  AccessError,
  requireManage,
  requirePlatform,
  tenantScope,
} from "./policy";
import { lockGatewayTenant } from "./gateway-assignment";
import { requireTenantQuota } from "./licensing";
const operation = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("CREATE"),
      expiresAt: z.iso.datetime().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("ROTATE"),
      credentialId: z.string().min(1),
      expiresAt: z.iso.datetime().optional(),
    })
    .strict(),
  z
    .object({ operation: z.literal("REVOKE"), credentialId: z.string().min(1) })
    .strict(),
]);
export async function createPilotGateway(
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requirePlatform(actor);
  const tenantId = tenantScope(actor, requested);
  const value = z
    .object({
      name: z.string().trim().min(1).max(160),
      externalGatewayId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
      propertyId: z.string().min(1),
      manufacturer: z.string().trim().min(1).max(160).default("Pilot"),
      model: z.string().trim().min(1).max(160).default("Edge Agent"),
    })
    .strict()
    .parse(raw);
  return db.$transaction(async (tx) => {
    await lockGatewayTenant(tx, tenantId);
    if (
      !(await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      }))
    )
      throw new AccessError(404, "Kunde nicht gefunden.");
    if (
      value.propertyId &&
      !(await tx.property.findFirst({
        where: { id: value.propertyId, tenantId },
        select: { id: true },
      }))
    )
      throw new AccessError(404, "Liegenschaft nicht gefunden.");
    await requireTenantQuota(tx, tenantId, "gateways");
    const gateway = await tx.gateway.create({
      data: {
        tenantId,
        ...value,
        lifecycleStatus: "NEW",
        installedAt: null,
        status: "OFFLINE",
      },
      select: { id: true, name: true },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: gateway.id,
        action: "gateway.created",
      },
    });
    return gateway;
  });
}

export async function registerGatewayPublicKey(
  gatewayId: string,
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requirePlatform(actor);
  const tenantId = tenantScope(actor, requested);
  const value = z
    .object({
      publicKey: z.string().trim().max(256),
      expiresAt: z.iso.datetime().optional(),
    })
    .strict()
    .parse(raw);
  // Only Ed25519 SubjectPublicKeyInfo PEM; never let createPublicKey accept a
  // private key and silently extract its public half.
  if (
    !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----$/.test(
      value.publicKey,
    )
  )
    throw new AccessError(
      400,
      "Ed25519-Public-Key im SPKI-PEM-Format erforderlich.",
    );
  let publicKey: string, fingerprint: string;
  try {
    const key = createPublicKey(value.publicKey);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("type");
    publicKey = key.export({ type: "spki", format: "pem" }).toString();
    fingerprint = createHash("sha256")
      .update(key.export({ type: "spki", format: "der" }))
      .digest("hex");
  } catch {
    throw new AccessError(400, "Ungültiger Ed25519-Public-Key.");
  }
  const expiresAt = value.expiresAt ? new Date(value.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date())
    throw new AccessError(400, "Ablaufdatum muss in der Zukunft liegen.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Gateway" WHERE "id"=${gatewayId} AND "tenantId"=${tenantId} FOR UPDATE`;
    const gateway = await tx.gateway.findFirst({
      where: { id: gatewayId, tenantId },
    });
    if (!gateway) throw new AccessError(404, "Gateway nicht gefunden.");
    if (
      !["NEW", "PROVISIONING", "MAINTENANCE"].includes(gateway.lifecycleStatus)
    )
      throw new AccessError(
        409,
        "Signaturidentität nur vor Aktivierung oder in Wartung registrieren.",
      );
    if (
      await tx.gatewayCredential.findFirst({
        where: { gatewayId, tenantId, keyFingerprint: fingerprint },
      })
    )
      throw new AccessError(
        409,
        "Public Key bereits registriert; für einen Wechsel einen neuen lokalen Schlüssel verwenden.",
      );
    const row = await tx.gatewayCredential.create({
      data: {
        id: randomUUID(),
        gatewayId,
        tenantId,
        publicKey,
        keyFingerprint: fingerprint,
        expiresAt,
      },
      select: { id: true, keyFingerprint: true, status: true, expiresAt: true },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: row.id,
        action: "gateway.credential.register",
        details: { gatewayId, keyFingerprint: fingerprint },
      },
    });
    return row;
  });
}
async function access(gatewayId: string, requested?: string | null) {
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  if (
    !(await db.gateway.findFirst({
      where: { id: gatewayId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Gateway nicht gefunden.");
  return { actor, tenantId };
}
export async function listGatewayCredentials(
  gatewayId: string,
  requested?: string | null,
) {
  const { tenantId } = await access(gatewayId, requested);
  return db.gatewayCredential.findMany({
    where: { gatewayId, tenantId },
    select: {
      id: true,
      status: true,
      keyFingerprint: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
export async function manageGatewayCredential(
  gatewayId: string,
  raw: unknown,
  requested?: string | null,
) {
  const { actor, tenantId } = await access(gatewayId, requested);
  requirePlatform(actor);
  const value = operation.parse(raw);
  const expiresAt =
    "expiresAt" in value && value.expiresAt ? new Date(value.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now())
    throw new AccessError(400, "Ablaufdatum muss in der Zukunft liegen.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Gateway" WHERE "id"=${gatewayId} AND "tenantId"=${tenantId} FOR UPDATE`;
    const gateway = await tx.gateway.findFirst({
      where: { id: gatewayId, tenantId },
      select: { lifecycleStatus: true },
    });
    if (!gateway) throw new AccessError(404, "Gateway nicht gefunden.");
    if (gateway.lifecycleStatus === "DECOMMISSIONED")
      throw new AccessError(409, "Gateway ist stillgelegt.");
    if (value.operation !== "CREATE") {
      const previous = await tx.gatewayCredential.findFirst({
        where: { id: value.credentialId, gatewayId, tenantId },
      });
      if (!previous) throw new AccessError(404, "Credential nicht gefunden.");
      if (value.operation === "ROTATE" && previous.status !== "ACTIVE")
        throw new AccessError(409, "Credential bereits widerrufen.");
      await tx.gatewayCredential.update({
        where: { id: previous.id },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
    }
    let result: { id: string; privateKey?: string } = {
      id: "credentialId" in value ? value.credentialId : "",
    };
    if (value.operation !== "REVOKE") {
      const keys = generateKeyPairSync("ed25519");
      const publicKey = keys.publicKey
        .export({ type: "spki", format: "pem" })
        .toString();
      const fingerprint = createHash("sha256")
        .update(keys.publicKey.export({ type: "spki", format: "der" }))
        .digest("hex");
      const id = randomUUID();
      await tx.gatewayCredential.create({
        data: {
          id,
          tenantId,
          gatewayId,
          publicKey,
          keyFingerprint: fingerprint,
          expiresAt,
        },
      });
      result = {
        id,
        privateKey: keys.privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
      };
    }
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: result.id,
        action: `gateway.credential.${value.operation.toLowerCase()}`,
      },
    });
    return result;
  });
}
