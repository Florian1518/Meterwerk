export type Level = "DEBUG" | "INFO" | "WARN" | "ERROR";
const ranks = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
// Allowlisted fields only. Never serialize error objects, request bodies or URLs.
export function logRecord(
  level: Level,
  service: string,
  event: string,
  fields: Record<string, unknown> = {},
) {
  const result: Record<string, string | number> = {
    timestamp: new Date().toISOString(),
    level,
    service,
    event,
  };
  for (const key of [
    "tenantId",
    "gatewayId",
    "deviceId",
    "messageId",
    "correlationId",
  ]) {
    const value = fields[key];
    if (typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value))
      result[key] = value;
  }
  for (const key of [
    "queueSize",
    "quarantineSize",
    "dropped",
    "attempts",
    "durationMs",
  ]) {
    if (typeof fields[key] === "number" && Number.isFinite(fields[key]))
      result[key] = fields[key] as number;
  }
  return result;
}
export function log(
  level: Level,
  service: string,
  event: string,
  fields: Record<string, unknown> = {},
) {
  const configured = process.env.LOG_LEVEL as Level;
  if (ranks[level] < (ranks[configured] ?? ranks.INFO)) return;
  console.log(JSON.stringify(logRecord(level, service, event, fields)));
}
