import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { AccessError, tenantScope } from "./policy";
import { requireTenantFeature, recordTenantUsage } from "./licensing";
export const hashDeviceToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function newDeviceToken() {
  return `mtr_${randomBytes(32).toString("base64url")}`;
}
export async function authenticateDevice(authorization: string | null) {
  if (!authorization?.startsWith("Bearer "))
    throw new AccessError(401, "Ungültiges Device-Credential.");
  const token = authorization.slice(7).trim();
  if (token.length < 20)
    throw new AccessError(401, "Ungültiges Device-Credential.");
  const credential = await db.deviceCredential.findUnique({
    where: { tokenHash: hashDeviceToken(token) },
    include: { device: { include: { meter: true, gateway: true } } },
  });
  if (!credential) throw new AccessError(401, "Ungültiges Device-Credential.");
  await requireTenantFeature(credential.device.tenantId, "API");
  if (
    credential.status !== "ACTIVE" ||
    credential.device.status === "DISABLED" ||
    credential.device.lifecycleStatus === "DECOMMISSIONED"
  )
    throw new AccessError(403, "Device ist deaktiviert.");
  if (!["ONLINE", "WARNING", "OFFLINE"].includes(credential.device.status))
    throw new AccessError(
      403,
      "Device ist nicht für Ingestion freigeschaltet.",
    );
  await db.deviceCredential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() },
  });
  await recordTenantUsage(credential.device.tenantId, "API");
  return { credential, device: credential.device };
}
export async function consumeDeviceRateLimit(key: string) {
  const now = new Date();
  const reset = new Date(now.getTime() + 60_000);
  const result = await db.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "DeviceRateLimit" ("key","attempts","resetAt") VALUES (${key},1,${reset})
    ON CONFLICT ("key") DO UPDATE SET "attempts"=CASE WHEN "DeviceRateLimit"."resetAt" < ${now} THEN 1 ELSE "DeviceRateLimit"."attempts"+1 END,"resetAt"=CASE WHEN "DeviceRateLimit"."resetAt" < ${now} THEN ${reset} ELSE "DeviceRateLimit"."resetAt" END RETURNING "attempts"`;
  if (result[0]?.attempts > 120)
    throw new AccessError(
      429,
      "Device-Rate-Limit erreicht. Bitte später erneut senden.",
    );
}
export async function issueDeviceToken(
  actor: { id: string; tenantId: string | null; role: string },
  input: { deviceId: string },
  requested?: string | null,
) {
  if (!["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role))
    throw new AccessError(403, "Keine Device-Verwaltungsberechtigung.");
  const tenantId = tenantScope(
    {
      ...actor,
      name: "",
      email: "",
      role: actor.role as "SUPER_ADMIN" | "TENANT_ADMIN" | "MANAGER" | "USER",
    },
    requested,
  );
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id"=${input.deviceId} AND "tenantId"=${tenantId} FOR UPDATE`;
    const device = await tx.device.findFirst({
      where: { id: input.deviceId, tenantId },
    });
    if (!device) throw new AccessError(404, "Device nicht gefunden.");
    if (device.lifecycleStatus === "DECOMMISSIONED")
      throw new AccessError(409, "Device ist außer Betrieb.");
    const token = newDeviceToken();
    const revoked = await tx.deviceCredential.updateMany({
      where: { tenantId, deviceId: device.id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const credential = await tx.deviceCredential.create({
      data: {
        tenantId,
        deviceId: device.id,
        tokenHash: hashDeviceToken(token),
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: credential.id,
        action: revoked.count
          ? "device.credential.rotate"
          : "device.credential.issue",
        details: { deviceId: device.id, revokedCount: revoked.count },
      },
    });
    return { token, deviceId: device.id };
  });
}

export async function revokeDeviceToken(
  actor: { id: string; tenantId: string | null; role: string },
  credentialId: string,
  requested?: string | null,
) {
  if (!["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role))
    throw new AccessError(403, "Keine Device-Verwaltungsberechtigung.");
  const tenantId = tenantScope(
    {
      ...actor,
      id: actor.id,
      name: "",
      email: "",
      role: actor.role as "SUPER_ADMIN" | "TENANT_ADMIN" | "MANAGER" | "USER",
    },
    requested,
  );
  const credential = await db.deviceCredential.findFirst({
    where: { id: credentialId, tenantId },
  });
  if (!credential) throw new AccessError(404, "Credential nicht gefunden.");
  return db.$transaction(async (tx) => {
    await tx.deviceCredential.updateMany({
      where: { id: credentialId, tenantId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const row = await tx.deviceCredential.findFirstOrThrow({
      where: { id: credentialId, tenantId },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: credentialId,
        action: "device.credential.revoke",
        details: { deviceId: row.deviceId },
      },
    });
    return row;
  });
}
