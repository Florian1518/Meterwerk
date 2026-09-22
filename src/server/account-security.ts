import "server-only";
import { requireTenantQuota } from "./licensing";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, requireManage, tenantScope } from "./policy";
import { hashPassword } from "./password";
import { sendMail } from "./mail";

const emailSchema = z.object({ email: z.email().toLowerCase() });
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function requestPasswordReset(input: unknown) {
  const { email } = emailSchema.parse(input);
  const rateKey = `reset:${tokenHash(email)}`;
  const limits = await db.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "LoginLimit" ("key", "attempts", "resetAt") VALUES (${rateKey}, 1, ${new Date(Date.now() + 60 * 60_000)})
    ON CONFLICT ("key") DO UPDATE SET "attempts" = CASE WHEN "LoginLimit"."resetAt" < NOW() THEN 1 ELSE "LoginLimit"."attempts" + 1 END,
    "resetAt" = CASE WHEN "LoginLimit"."resetAt" < NOW() THEN ${new Date(Date.now() + 60 * 60_000)} ELSE "LoginLimit"."resetAt" END RETURNING "attempts"`;
  if (limits[0].attempts > 5) return { accepted: true };
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active) return { accepted: true };
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  await sendMail({
    to: email,
    subject: "Meterwerk Passwort zurücksetzen",
    template: "PASSWORD_RESET",
    text: `Passwort zurücksetzen: ${process.env.APP_URL ?? "http://localhost:3000"}/password-reset?token=${token}`,
  });
  return { accepted: true };
}
export async function resetPassword(input: unknown) {
  const value = z
    .object({
      token: z.string().min(32),
      password: z.string().min(12).max(128),
    })
    .parse(input);
  const row = await db.passwordResetToken.findFirst({
    where: {
      tokenHash: tokenHash(value.token),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!row)
    throw new AccessError(400, "Ungültiger oder abgelaufener Reset-Link.");
  const passwordHash = await hashPassword(value.password);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    await tx.session.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: null,
        actorId: row.userId,
        action: "auth.password_reset",
        entityId: row.userId,
      },
    });
  });
  return { accepted: true };
}
export async function createInvitation(
  input: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const value = z
    .object({
      email: z.email().toLowerCase(),
      role: z.enum(["TENANT_ADMIN", "MANAGER", "USER"]),
      propertyIds: z.array(z.string()).default([]),
      expiresInHours: z.number().int().min(1).max(168).default(72),
    })
    .parse(input);
  if (
    actor.role !== "SUPER_ADMIN" &&
    value.role === "TENANT_ADMIN" &&
    actor.tenantId !== tenantId
  )
    throw new AccessError(403, "Keine Berechtigung.");
  const token = randomBytes(32).toString("base64url");
  const invitation = await db.invitation.create({
    data: {
      tenantId,
      email: value.email,
      role: value.role,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + value.expiresInHours * 3600000),
      propertyIds: value.propertyIds,
      createdById: actor.id,
    },
  });
  await sendMail({
    to: value.email,
    subject: "Einladung zu Meterwerk",
    template: "INVITATION",
    text: `Einladung annehmen: ${process.env.APP_URL ?? "http://localhost:3000"}/invite?token=${token}`,
  });
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "user.invitation.create",
      entityId: invitation.id,
    },
  });
  return { id: invitation.id, expiresAt: invitation.expiresAt.toISOString() };
}
export async function acceptInvitation(input: unknown) {
  const value = z
    .object({
      token: z.string().min(32),
      name: z.string().trim().min(1).max(120),
      password: z.string().min(12).max(128),
    })
    .parse(input);
  const invitation = await db.invitation.findFirst({
    where: {
      tokenHash: tokenHash(value.token),
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!invitation)
    throw new AccessError(400, "Ungültige oder abgelaufene Einladung.");
  const existing = await db.user.findUnique({
    where: { email: invitation.email },
  });
  if (existing)
    throw new AccessError(409, "Diese E-Mail-Adresse ist bereits registriert.");
  const passwordHash = await hashPassword(value.password);
  const user = await db.$transaction(async (tx) => {
    await requireTenantQuota(tx, invitation.tenantId, "users");
    const created = await tx.user.create({
      data: {
        tenantId: invitation.tenantId,
        email: invitation.email,
        name: value.name,
        role: invitation.role,
        passwordHash,
      },
    });
    const propertyIds = Array.isArray(invitation.propertyIds)
      ? invitation.propertyIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [];
    if (propertyIds.length)
      await tx.propertyGrant.createMany({
        data: propertyIds.map((propertyId) => ({
          tenantId: invitation.tenantId,
          userId: created.id,
          propertyId,
        })),
      });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedById: created.id },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: invitation.tenantId,
        actorId: created.id,
        action: "user.invitation.accept",
        entityId: invitation.id,
      },
    });
    return created;
  });
  return { id: user.id, email: user.email };
}
export async function setNotificationPreference(
  input: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  tenantScope(actor, requested);
  const value = z
    .object({
      channel: z.enum(["PORTAL", "EMAIL", "SMS", "PUSH", "WEBHOOK"]),
      event: z.string().min(1).max(80),
      enabled: z.boolean(),
    })
    .parse(input);
  return db.notificationPreference.upsert({
    where: {
      userId_channel_event: {
        userId: actor.id,
        channel: value.channel,
        event: value.event,
      },
    },
    create: {
      userId: actor.id,
      channel: value.channel,
      event: value.event,
      enabled: value.enabled,
    },
    update: { enabled: value.enabled },
  });
}
