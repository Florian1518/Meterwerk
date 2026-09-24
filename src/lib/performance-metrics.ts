export type PerformanceMetric =
  | "requestDuration"
  | "dbQueryDuration"
  | "queueLag"
  | "workerThroughput"
  | "workerFailures"
  | "ingestionRate"
  | "aggregationDuration"
  | "exportDuration";

export type MetricSample = {
  metric: PerformanceMetric;
  value: number;
  tenantId?: string;
  recordedAt: Date;
};

/** Small bounded in-process buffer for diagnostics; persistence belongs to the metrics backend. */
export class PerformanceSamples {
  private readonly samples: MetricSample[] = [];
  constructor(private readonly maxSamples = 1_000) {}

  add(sample: MetricSample) {
    if (!Number.isFinite(sample.value)) return;
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  snapshot() {
    return this.samples.slice();
  }
}
