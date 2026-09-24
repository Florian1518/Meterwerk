import { describe, expect, it } from "vitest";
import {
  aggregationBucket,
  clampPageSize,
  exponentialBackoff,
  exceedsReadingWindow,
  leaseExpired,
  tenantCacheKey,
} from "@/lib/performance";
import {
  backlogLevel,
  boundedBatchSize,
  boundedConcurrency,
} from "@/lib/backpressure";
import { PerformanceSamples } from "@/lib/performance-metrics";

describe("performance safeguards", () => {
  it("clamps page sizes to a bounded, positive window", () => {
    expect(clampPageSize(500)).toBe(100);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize("invalid")).toBe(50);
  });

  it("rejects unbounded reading windows", () => {
    const from = new Date("2025-01-01T00:00:00Z");
    expect(exceedsReadingWindow(from, new Date("2026-01-05T00:00:00Z"))).toBe(
      true,
    );
    expect(exceedsReadingWindow(from, new Date("2025-06-01T00:00:00Z"))).toBe(
      false,
    );
  });

  it("always scopes cache keys to a tenant", () => {
    expect(tenantCacheKey("tenant-a", "analytics", "hourly")).toBe(
      "analytics:tenant:tenant-a:hourly",
    );
    expect(() => tenantCacheKey("", "analytics", "hourly")).toThrow();
  });

  it("uses deterministic UTC aggregation buckets", () => {
    const timestamp = new Date("2026-09-24T13:42:19.000Z");
    expect(aggregationBucket(timestamp, "hour").toISOString()).toBe(
      "2026-09-24T13:00:00.000Z",
    );
    expect(aggregationBucket(timestamp, "day").toISOString()).toBe(
      "2026-09-24T00:00:00.000Z",
    );
  });

  it("provides bounded retry backoff and lease checks", () => {
    expect(exponentialBackoff(0)).toBe(1_000);
    expect(exponentialBackoff(20)).toBe(300_000);
    expect(leaseExpired(new Date("2020-01-01T00:00:00Z"))).toBe(true);
    expect(leaseExpired(new Date("2999-01-01T00:00:00Z"))).toBe(false);
  });

  it("classifies backlog and bounds worker pressure", () => {
    expect(backlogLevel(10)).toBe("NORMAL");
    expect(backlogLevel(100)).toBe("WARNING");
    expect(backlogLevel(1000)).toBe("CRITICAL");
    expect(boundedConcurrency(50, 4)).toBe(4);
    expect(boundedBatchSize(500, 20)).toBe(20);
  });

  it("keeps performance samples bounded", () => {
    const samples = new PerformanceSamples(2);
    const recordedAt = new Date();
    samples.add({ metric: "requestDuration", value: 1, recordedAt });
    samples.add({ metric: "requestDuration", value: 2, recordedAt });
    samples.add({ metric: "requestDuration", value: 3, recordedAt });
    expect(samples.snapshot().map((sample) => sample.value)).toEqual([2, 3]);
  });
});
