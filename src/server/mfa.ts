import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { db } from "./db";
import { AccessError, type Actor } from "./policy";
import { stableSecretKey } from "./security-config";
import { verifyPassword } from "./password";

function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", stableSecretKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
function decrypt(value: string) {
  const [iv, tag, data] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    stableSecretKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
export const decryptForAuth = decrypt;
function base32(value: string) {
  let bits = "";
  for (const char of value)
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(char)
      .toString(2)
      .padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function code(secret: string, counter: number) {
  const digest = createHmac("sha1", base32(secret))
    .update(Buffer.from(counter.toString(16).padStart(16, "0"), "hex"))
    .digest();
  const offset = digest[digest.length - 1] & 15;
  return String(
    (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000,
  ).padStart(6, "0");
}
function normalizeBase32(value: string) {
  return value.replace(/=+$/, "").toUpperCase();
}
function newSecret() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  return Array.from(
    randomBytes(32),
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
}
export function verifyTotp(secret: string, token: string, now = Date.now()) {
  const normalized = normalizeBase32(secret);
  const counter = Math.floor(now / 30000);
  return [-1, 0, 1].some(
    (offset) => code(normalized, counter + offset) === token,
  );
}
export function totpCode(secret: string, now = Date.now()) {
  return code(normalizeBase32(secret), Math.floor(now / 30000));
}
export async function beginMfaSetup(actor: Actor) {
  const secret = newSecret();
  const encrypted = encrypt(secret);
  await db.user.update({
    where: { id: actor.id },
    data: { mfaSecretEncrypted: encrypted, mfaEnabled: false },
  });
  return {
    secret,
    otpauth: `otpauth://totp/Meterwerk:${encodeURIComponent(actor.email)}?secret=${secret}&issuer=Meterwerk`,
    qrData: `otpauth://totp/Meterwerk:${encodeURIComponent(actor.email)}?secret=${secret}&issuer=Meterwerk`,
  };
}
export async function confirmMfaSetup(actor: Actor, token: string) {
  const user = await db.user.findUnique({
    where: { id: actor.id },
    select: { mfaSecretEncrypted: true },
  });
  if (
    !user?.mfaSecretEncrypted ||
    !verifyTotp(decrypt(user.mfaSecretEncrypted), token)
  )
    throw new AccessError(400, "Ungültiger MFA-Code.");
  const recovery = Array.from({ length: 10 }, () =>
    randomBytes(5).toString("hex").toUpperCase(),
  );
  await db.$transaction(async (tx) => {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: actor.id } });
    await tx.mfaRecoveryCode.createMany({
      data: recovery.map((value) => ({
        userId: actor.id,
        codeHash: createHash("sha256").update(value).digest("hex"),
      })),
    });
    await tx.user.update({
      where: { id: actor.id },
      data: { mfaEnabled: true, mfaConfiguredAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        action: "auth.mfa.enable",
        entityId: actor.id,
      },
    });
  });
  return recovery;
}
export async function disableMfa(
  actor: Actor,
  password: string,
  token: string,
) {
  const user = await db.user.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true, mfaSecretEncrypted: true },
  });
  if (
    !user ||
    !(await verifyPassword(user.passwordHash, password)) ||
    !user.mfaSecretEncrypted ||
    !verifyTotp(decrypt(user.mfaSecretEncrypted), token)
  )
    throw new AccessError(403, "Erneute Authentifizierung erforderlich.");
  await db.$transaction([
    db.user.update({
      where: { id: actor.id },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaConfiguredAt: null,
      },
    }),
    db.mfaRecoveryCode.deleteMany({ where: { userId: actor.id } }),
    db.auditEvent.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        action: "auth.mfa.disable",
        entityId: actor.id,
      },
    }),
  ]);
}
export async function verifyRecoveryCode(userId: string, value: string) {
  const hash = createHash("sha256")
    .update(value.trim().toUpperCase())
    .digest("hex");
  const row = await db.mfaRecoveryCode.findFirst({
    where: { userId, codeHash: hash, usedAt: null },
  });
  if (!row) return false;
  await db.mfaRecoveryCode.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return true;
}
