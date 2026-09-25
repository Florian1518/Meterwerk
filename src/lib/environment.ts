export const METERWERK_ENVIRONMENTS = [
  "development",
  "test",
  "staging",
  "demo",
  "production",
] as const;
export type MeterwerkEnvironment = (typeof METERWERK_ENVIRONMENTS)[number];
export function getEnvironment(
  value = process.env.METERWERK_ENV ?? process.env.NODE_ENV ?? "development",
): MeterwerkEnvironment {
  if (!METERWERK_ENVIRONMENTS.includes(value as MeterwerkEnvironment))
    throw new Error(`Ungültige Meterwerk-Umgebung: ${value}`);
  return value as MeterwerkEnvironment;
}
export function isDemoEnvironment(value = getEnvironment()) {
  return value === "demo" || value === "test";
}
export function assertDemoResetAllowed(
  value = getEnvironment(),
  confirmation = process.env.DEMO_RESET_CONFIRM,
) {
  if (!isDemoEnvironment(value) || confirmation !== "I_UNDERSTAND_DEMO_RESET")
    throw new Error(
      "Demo-Reset ist nur in DEMO/TEST mit DEMO_RESET_CONFIRM=I_UNDERSTAND_DEMO_RESET erlaubt.",
    );
  return true;
}
export function assertStagingIsolation(
  env = getEnvironment(),
  values: Record<string, string | undefined> = process.env,
) {
  if (env !== "staging" && env !== "demo") return true;
  const endpoints = [
    values.DATABASE_URL,
    values.APP_URL,
    values.MQTT_URL,
    values.MQTT_BROKER_URL,
    values.STORAGE_ENDPOINT,
    values.ATTACHMENT_S3_ENDPOINT,
    values.WEBHOOK_BASE_URL,
    values.EMAIL_API_URL,
    values.SMTP_URL,
    values.PUSH_API_URL,
    values.BACKUP_STORAGE_ENDPOINT,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (["prod", "production", "live"].some((token) => endpoints.includes(token)))
    throw new Error(
      "Staging/Demo verweist auf einen offensichtlichen Produktions-Endpunkt.",
    );
  return true;
}
export function environmentLabel(env = getEnvironment()) {
  return env === "demo" ? "DEMO" : env === "staging" ? "STAGING" : "";
}
