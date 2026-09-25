export type ReadinessStatus = "READY" | "DEGRADED" | "NOT_READY" | "UNKNOWN";
export type ReadinessChecks = Partial<
  Record<
    | "web"
    | "database"
    | "mqtt"
    | "rulesWorker"
    | "deviceWorker"
    | "notificationWorker"
    | "reportWorker"
    | "storage"
    | "migrations"
    | "buildVersion"
    | "gitSha",
    boolean
  >
>;
export function evaluateStagingReadiness(
  checks: ReadinessChecks,
): ReadinessStatus {
  const required = [
    "web",
    "database",
    "mqtt",
    "rulesWorker",
    "deviceWorker",
    "migrations",
    "buildVersion",
    "gitSha",
  ] as const;
  if (required.some((key) => checks[key] === false)) return "NOT_READY";
  if (required.some((key) => checks[key] === undefined)) return "UNKNOWN";
  const optional = ["notificationWorker", "reportWorker", "storage"] as const;
  return optional.some((key) => checks[key] === false) ? "DEGRADED" : "READY";
}
export function canPromote(input: {
  ci: boolean;
  migration: boolean;
  readiness: ReadinessStatus;
  e2e: boolean;
  security: boolean;
  versionMatches: boolean;
  shaMatches: boolean;
}) {
  return (
    input.ci &&
    input.migration &&
    input.readiness === "READY" &&
    input.e2e &&
    input.security &&
    input.versionMatches &&
    input.shaMatches
  );
}
