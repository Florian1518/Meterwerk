const env = process.env.METERWERK_ENV ?? process.env.NODE_ENV ?? "development";
const allowed = new Set([
  "development",
  "test",
  "staging",
  "demo",
  "production",
]);
if (!allowed.has(env)) throw new Error(`Invalid METERWERK_ENV: ${env}`);
if (["staging", "demo"].includes(env)) {
  const values = [
    process.env.DATABASE_URL,
    process.env.APP_URL,
    process.env.MQTT_URL,
    process.env.STORAGE_ENDPOINT,
    process.env.WEBHOOK_BASE_URL,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (["prod", "production", "live"].some((token) => values.includes(token)))
    throw new Error("Staging/Demo endpoint points at production-like resource");
}
console.log(`Environment guard passed: ${env}`);
