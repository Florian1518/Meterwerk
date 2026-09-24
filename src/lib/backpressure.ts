export type BackpressureLevel = "NORMAL" | "WARNING" | "CRITICAL";

export const defaultBackpressure = {
  warningBacklog: 100,
  criticalBacklog: 1_000,
  maxBatchSize: 100,
  maxConcurrency: 10,
} as const;

export function backlogLevel(
  backlog: number,
  thresholds = defaultBackpressure,
): BackpressureLevel {
  if (backlog >= thresholds.criticalBacklog) return "CRITICAL";
  if (backlog >= thresholds.warningBacklog) return "WARNING";
  return "NORMAL";
}

export function boundedConcurrency(requested: number, capacity = 10) {
  return Math.max(1, Math.min(Math.trunc(requested), capacity));
}

export function boundedBatchSize(requested: number, maximum = 100) {
  return Math.max(1, Math.min(Math.trunc(requested), maximum));
}
