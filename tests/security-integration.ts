import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/password";
import {
  beginMfaSetup,
  confirmMfaSetup,
  disableMfa,
  totpCode,
} from "../src/server/mfa";
import {
  acceptInvitation,
  requestPasswordReset,
  resetPassword,
} from "../src/server/account-security";
import { localMails } from "../src/server/mail";
if (process.env.SEED_DEMO !== "true")
  throw new Error("Lokale Demo-Datenbank erforderlich.");
const tenantId = "demo-multi-utility";
const email = `security-${randomBytes(5).toString("hex")}@example.test`;
const password = "Testpassword-123!";
const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const user = await db.user.create({
  data: {
    tenantId,
    email,
    name: "Security Test",
    role: "TENANT_ADMIN",
    passwordHash: await hashPassword(password),
  },
});
let invitedEmail = "";
try {
  const actor = {
    id: user.id,
    tenantId,
    role: "TENANT_ADMIN" as const,
    name: user.name,
    email,
  };
  const setup = await beginMfaSetup(actor);
  const recovery = await confirmMfaSetup(actor, totpCode(setup.secret));
  assert.equal(recovery.length, 10);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).mfaEnabled,
    true,
  );
  await disableMfa(actor, password, totpCode(setup.secret));
  const resetBefore = localMails().length;
  await requestPasswordReset({ email });
  const resetMail = localMails().slice(resetBefore)[0];
  const resetToken = resetMail.text.split("token=")[1];
  await resetPassword({ token: resetToken, password: "New-password-456!" });
  await assert.rejects(() =>
    resetPassword({ token: resetToken, password: "Another-password-789!" }),
  );
  const invitationToken = randomBytes(32).toString("base64url");
  invitedEmail = `invited-${randomBytes(4).toString("hex")}@example.test`;
  const invitation = await db.invitation.create({
    data: {
      tenantId,
      email: invitedEmail,
      role: "USER",
      tokenHash: tokenHash(invitationToken),
      expiresAt: new Date(Date.now() + 3600000),
      createdById: user.id,
    },
  });
  const accepted = await acceptInvitation({
    token: invitationToken,
    name: "Invited User",
    password: "Invitation-password-123!",
  });
  assert.equal(accepted.email, invitation.email);
  await assert.rejects(() =>
    acceptInvitation({
      token: invitationToken,
      name: "Replay",
      password: "Invitation-password-123!",
    }),
  );
  console.log(
    "security integration passed: MFA, recovery codes, reset replay, invitation replay",
  );
} finally {
  await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
  if (invitedEmail)
    await db.user.deleteMany({ where: { email: invitedEmail } });
  await db.$disconnect();
}
