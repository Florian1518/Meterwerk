import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

export const securityConfigSchema = z.object({
  METERWERK_ENV: z
    .enum(["development", "test", "staging", "demo", "pilot", "production"])
    .default("development"),
  APP_URL: z.string().url(),
  BASE_DOMAIN: z.string().min(1).default("meterwerk.de"),
  SESSION_SECRET: z.string().min(32).optional(),
  MFA_ENCRYPTION_KEY: z.string().min(32).optional(),
  EMAIL_PROVIDER: z.enum(["local", "smtp", "api"]).default("local"),
  SMTP_URL: z.string().url().optional(),
  EMAIL_API_URL: z.string().url().optional(),
  EMAIL_API_KEY: z.string().min(16).optional(),
  TRUSTED_HOSTS: z.string().default("localhost,127.0.0.1"),
});
export const securityConfig = securityConfigSchema.parse({
  METERWERK_ENV: process.env.METERWERK_ENV,
  APP_URL: process.env.APP_URL ?? "http://localhost:3000",
  BASE_DOMAIN: process.env.BASE_DOMAIN,
  SESSION_SECRET: process.env.SESSION_SECRET,
  MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  SMTP_URL: process.env.SMTP_URL,
  EMAIL_API_URL: process.env.EMAIL_API_URL,
  EMAIL_API_KEY: process.env.EMAIL_API_KEY,
  TRUSTED_HOSTS: process.env.TRUSTED_HOSTS,
});
export const trustedHosts = securityConfig.TRUSTED_HOSTS.split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
export function requireProductionSecrets() {
  if (securityConfig.METERWERK_ENV === "production") {
    if (!securityConfig.SESSION_SECRET || !securityConfig.MFA_ENCRYPTION_KEY)
      throw new Error(
        "SESSION_SECRET und MFA_ENCRYPTION_KEY sind in production erforderlich.",
      );
    if (securityConfig.EMAIL_PROVIDER === "smtp" && !securityConfig.SMTP_URL)
      throw new Error("SMTP_URL ist erforderlich.");
    if (
      securityConfig.EMAIL_PROVIDER === "api" &&
      (!securityConfig.EMAIL_API_URL || !securityConfig.EMAIL_API_KEY)
    )
      throw new Error("EMAIL_API_URL und EMAIL_API_KEY sind erforderlich.");
  }
}
export function hostTenantHint(host: string) {
  const normalized = host.toLowerCase().split(":")[0];
  if (trustedHosts.includes(normalized)) return null;
  const base = securityConfig.BASE_DOMAIN;
  if (normalized.endsWith(`.${base}`))
    return normalized.slice(0, -(base.length + 1));
  return null;
}
export function stableSecretKey() {
  return createHash("sha256")
    .update(securityConfig.MFA_ENCRYPTION_KEY ?? "development-only-mfa-key")
    .digest();
}
