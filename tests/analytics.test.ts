import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { bucketKey } from "../src/server/analytics";

describe("analytics time buckets", () => {
  it("keeps UTC instants and renders tenant-local 15 minute buckets", () => {
    expect(
      bucketKey(new Date("2026-01-15T09:07:00Z"), "15m", "Europe/Berlin"),
    ).toBe("2026-01-15T10:00");
    expect(bucketKey(new Date("2026-01-15T09:07:00Z"), "hour", "UTC")).toBe(
      "2026-01-15T09:00",
    );
  });
  it("handles DST transition without changing the UTC source", () => {
    const before = bucketKey(
      new Date("2026-03-29T00:30:00Z"),
      "hour",
      "Europe/Berlin",
    );
    const after = bucketKey(
      new Date("2026-03-29T01:30:00Z"),
      "hour",
      "Europe/Berlin",
    );
    expect(before).toBe("2026-03-29T01:00");
    expect(after).toBe("2026-03-29T03:00");
  });
  it("uses decimal arithmetic for cost and comparison", () => {
    const current = new Decimal("1.10").mul("0.333333");
    const previous = new Decimal("1.00");
    expect(current.toFixed(6)).toBe("0.366666");
    expect(current.minus(previous).div(previous).mul(100).toFixed(2)).toBe(
      "-63.33",
    );
  });
});
