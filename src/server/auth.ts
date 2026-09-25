import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomBytes } from "node:crypto";
import { db } from "./db";
import { AccessError, type Actor } from "./policy";
import { hashPassword, verifyPassword } from "./password";
import { decryptForAuth, verifyRecoveryCode, verifyTotp } from "./mfa";
import { sessionCookieSecure } from "@/lib/security";
const cookieName = "meterwerk_session";
export const digest = (value: string) =>
  createHmac(
    "sha256",
    process.env.SESSION_SECRET ??
      (process.env.METERWERK_ENV === "production"
        ? (() => {
            throw new Error("SESSION_SECRET fehlt in production.");
          })()
        : "development-session-secret"),
  )
    .update(value)
    .digest("hex");
export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    !session.user.active
  )
    return null;
  const { id, tenantId, role, name, email } = session.user;
  return { id, tenantId, role, name, email };
}
export async function requireActor() {
  const actor = await currentActor();
  if (!actor) throw new AccessError(401, "Bitte anmelden.");
  return actor;
}
export async function requirePageActor() {
  const actor = await currentActor();
  if (!actor) {
    (await import("next/navigation")).redirect("/login");
    throw new AccessError(401, "Bitte anmelden.");
  }
  return actor;
}
let dummyHash: Promise<string> | undefined;
export async function signIn(
  email: string,
  password: string,
  mfaToken?: string,
) {
  const key = digest(email.toLowerCase()),
    now = new Date();
  const limits = await db.$queryRaw<
    Array<{ attempts: number }>
  >`INSERT INTO "LoginLimit" ("key", "attempts", "resetAt") VALUES (${key}, 1, ${new Date(now.getTime() + 15 * 60_000)}) ON CONFLICT ("key") DO UPDATE SET "attempts" = CASE WHEN "LoginLimit"."resetAt" < ${now} THEN 1 ELSE "LoginLimit"."attempts" + 1 END, "resetAt" = CASE WHEN "LoginLimit"."resetAt" < ${now} THEN ${new Date(now.getTime() + 15 * 60_000)} ELSE "LoginLimit"."resetAt" END RETURNING "attempts"`;
  if (limits[0].attempts === 9)
    await db.auditEvent.create({
      data: {
        actorId: "anonymous",
        entityId: key,
        action: "security.login.rate_limit",
      },
    });
  if (limits[0].attempts > 8)
    throw new AccessError(
      429,
      "Zu viele Versuche. Bitte nach 15 Minuten erneut anmelden.",
    );
  if (limits[0].attempts > 1)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(250 * limits[0].attempts, 2000)),
    );
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  const valid = await verifyPassword(
    user?.passwordHash ?? (await dummyHash),
    password,
  );
  if (!valid || !user?.active) {
    if (user)
      await db.loginHistory.create({
        data: {
          userId: user.id,
          email,
          success: false,
          reason: "INVALID_CREDENTIALS",
        },
      });
    throw new AccessError(401, "E-Mail oder Passwort ungültig.");
  }
  if (user.mfaEnabled) {
    let accepted = false;
    if (mfaToken && user.mfaSecretEncrypted) {
      try {
        accepted = verifyTotp(
          decryptForAuth(user.mfaSecretEncrypted),
          mfaToken,
        );
      } catch {
        accepted = false;
      }
    }
    if (!accepted && mfaToken)
      accepted = await verifyRecoveryCode(user.id, mfaToken);
    if (!accepted) {
      await db.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.id,
          entityId: user.id,
          action: "security.mfa.failed",
        },
      });
      throw new AccessError(401, "MFA-Code erforderlich.");
    }
  }
  const oldToken = (await cookies()).get(cookieName)?.value;
  const token = randomBytes(32).toString("base64url"),
    expiresAt = new Date(Date.now() + 8 * 60 * 60_000);
  await db.$transaction(async (tx) => {
    if (oldToken)
      await tx.session.updateMany({
        where: { id: digest(oldToken), userId: user.id },
        data: { revokedAt: now },
      });
    await tx.session.create({
      data: {
        id: digest(token),
        userId: user.id,
        expiresAt,
        rotatedFromId: oldToken ? digest(oldToken) : null,
      },
    });
    await tx.loginLimit.deleteMany({ where: { key } });
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        tenantId: user.tenantId,
        action: "auth.login",
        entityId: user.id,
      },
    });
    await tx.loginHistory.create({
      data: { userId: user.id, email, success: true },
    });
  });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: sessionCookieSecure(process.env.METERWERK_ENV),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
export async function signOutAll(userId: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
export async function signOut() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token)
    await db.session.updateMany({
      where: { id: digest(token) },
      data: { revokedAt: new Date() },
    });
  jar.delete(cookieName);
}
