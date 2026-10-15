import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";
import { hashPassword } from "./password";
import { assertStagingDatabase } from "./staging-database.mjs";

export class BootstrapError extends Error {}

export function validateBootstrapEnvironment(
  env: Record<string, string | undefined>,
) {
  if (env.METERWERK_ENV !== "staging")
    throw new BootstrapError("Bootstrap erfordert METERWERK_ENV=staging.");
  if (!env.DATABASE_URL) throw new BootstrapError("DATABASE_URL fehlt.");
  try {
    assertStagingDatabase(env.DATABASE_URL);
  } catch {
    throw new BootstrapError(
      "DATABASE_URL ist kein freigegebenes internes Staging-Ziel.",
    );
  }
  return env.DATABASE_URL;
}

const identitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^\p{Cc}\p{Cf}]+$/u),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});

export function parseBootstrapArguments(args: string[]) {
  const values: Record<string, string> = {};
  let stdin = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--password-stdin" && !stdin) {
      stdin = true;
      continue;
    }
    if (
      (flag !== "--name" && flag !== "--email") ||
      values[flag] !== undefined ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new BootstrapError(
        "Erlaubt: --name NAME --email EMAIL --password-stdin.",
      );
    values[flag] = args[++i];
  }
  if (!stdin) throw new BootstrapError("--password-stdin ist erforderlich.");
  const parsed = identitySchema.safeParse({
    name: values["--name"],
    email: values["--email"],
  });
  if (!parsed.success)
    throw new BootstrapError("Name oder E-Mail ist ungültig.");
  return parsed.data;
}

export async function readBootstrapPassword(
  input: AsyncIterable<string | Buffer>,
) {
  let value = "";
  for await (const chunk of input) {
    value += chunk.toString();
    if (Buffer.byteLength(value) > 1024)
      throw new BootstrapError("Passwort muss 14 bis 128 Zeichen enthalten.");
  }
  // Accept one terminating line ending, never trim password whitespace.
  value = value.replace(/\r?\n$/, "");
  if (value.length < 14 || value.length > 128 || /[\r\n]/.test(value))
    throw new BootstrapError(
      "Passwort muss 14 bis 128 Zeichen in einer Zeile enthalten.",
    );
  return value;
}

// Trusted operations entry only: no HTTP route, no session impersonation.
export async function createInitialStagingAdmin(
  db: PrismaClient,
  identity: { name: string; email: string },
  password: string,
) {
  const parsed = identitySchema.safeParse(identity);
  if (!parsed.success)
    throw new BootstrapError("Name oder E-Mail ist ungültig.");
  if (password.length < 14 || password.length > 128 || /[\r\n]/.test(password))
    throw new BootstrapError(
      "Passwort muss 14 bis 128 Zeichen in einer Zeile enthalten.",
    );
  const passwordHash = await hashPassword(password);
  return db.$transaction(
    async (tx) => {
      // Also excludes ordinary INSERT/UPDATE/DELETE, not just cooperating bootstraps.
      await tx.$executeRawUnsafe('LOCK TABLE "User" IN EXCLUSIVE MODE');
      if ((await tx.user.count()) !== 0)
        throw new BootstrapError(
          "Bootstrap verweigert: Es existiert bereits ein Benutzer.",
        );
      const user = await tx.user.create({
        data: {
          ...parsed.data,
          passwordHash,
          tenantId: null,
          role: "SUPER_ADMIN",
          active: true,
        },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: null,
          actorId: user.id,
          action: "STAGING_ADMIN_BOOTSTRAP",
          entityId: user.id,
        },
      });
      return user;
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}

export function bootstrapErrorMessage(error: unknown) {
  return error instanceof BootstrapError
    ? error.message
    : "Bootstrap fehlgeschlagen. Keine technischen Fehlerdetails werden ausgegeben.";
}
