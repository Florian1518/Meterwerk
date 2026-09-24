export const MAX_PAGE_SIZE = 100;
export const MAX_READING_WINDOW_DAYS = 366;
export const MAX_READING_EXPORT_ROWS = 10_000;

export function clampPageSize(value: unknown, maximum = MAX_PAGE_SIZE) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return Math.min(50, maximum);
  return Math.max(1, Math.min(Math.trunc(parsed), maximum));
}

/** Cache keys must always carry the tenant boundary. */
export function tenantCacheKey(
  tenantId: string,
  namespace: string,
  key: string,
) {
  if (!tenantId.trim()) throw new Error("tenantId is required for cache keys");
  return `${namespace}:tenant:${tenantId}:${key}`;
}

export type AggregationInterval = "hour" | "day";

export function aggregationBucket(
  timestamp: Date,
  interval: AggregationInterval,
) {
  const bucket = new Date(timestamp);
  bucket.setUTCMinutes(0, 0, 0);
  if (interval === "day") bucket.setUTCHours(0, 0, 0, 0);
  return bucket;
}

export function exponentialBackoff(
  attempt: number,
  baseMs = 1_000,
  maxMs = 300_000,
) {
  const safeAttempt = Math.max(0, Math.trunc(attempt));
  return Math.min(maxMs, baseMs * 2 ** safeAttempt);
}

export function leaseExpired(
  lockedUntil: Date | null | undefined,
  now = new Date(),
) {
  return !lockedUntil || lockedUntil <= now;
}

export function exceedsReadingWindow(from: Date, to: Date) {
  return to.getTime() - from.getTime() > MAX_READING_WINDOW_DAYS * 86400000;
}

export const performanceBudgets = {
  dashboardP95Ms: 1_000,
  simpleListP95Ms: 500,
  readingsP95Ms: 1_000,
  analyticsP95Ms: 2_000,
  publicApiP95Ms: 500,
  queueJobsPerMinutePerWorker: 100,
} as const;
