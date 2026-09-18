import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { AccessError, type Actor } from "./policy";
import { hashPassword, verifyPassword } from "./password";
const cookieName = "meterwerk_session";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active)
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
  if (!actor) redirect("/login");
  return actor;
}
let dummyHash: Promise<string> | undefined;
export async function signIn(email: string, password: string) {
  const key = digest(email.toLowerCase());
  const now = new Date();
  // Increment atomically so parallel requests cannot bypass the limit.
  const limits = await db.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "LoginLimit" ("key", "attempts", "resetAt") VALUES (${key}, 1, ${new Date(now.getTime() + 15 * 60_000)})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "LoginLimit"."resetAt" < ${now} THEN 1 ELSE "LoginLimit"."attempts" + 1 END,
      "resetAt" = CASE WHEN "LoginLimit"."resetAt" < ${now} THEN ${new Date(now.getTime() + 15 * 60_000)} ELSE "LoginLimit"."resetAt" END
    RETURNING "attempts"`;
  if (limits[0].attempts > 8)
    throw new AccessError(
      429,
      "Zu viele Versuche. Bitte nach 15 Minuten erneut anmelden.",
    );
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  const valid = await verifyPassword(
    user?.passwordHash ?? (await dummyHash),
    password,
  );
  if (!valid || !user?.active)
    throw new AccessError(401, "E-Mail oder Passwort ungültig.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 8 * 60 * 60_000);
  await db.$transaction([
    db.session.create({
      data: { id: digest(token), userId: user.id, expiresAt },
    }),
    db.loginLimit.deleteMany({ where: { key } }),
    db.auditEvent.create({
      data: {
        actorId: user.id,
        tenantId: user.tenantId,
        action: "auth.login",
        entityId: user.id,
      },
    }),
  ]);
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
export async function signOut() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await db.session.deleteMany({ where: { id: digest(token) } });
  jar.delete(cookieName);
}
