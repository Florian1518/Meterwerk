import { describe, expect, it } from "vitest";
import { usageLevel, unlimited } from "@/server/licensing";

describe("usage warnings", () => {
  it.each([
    [79, null],
    [80, 80],
    [89, 80],
    [90, 90],
    [99, 90],
    [100, 100],
    [120, 100],
  ])("%s percent triggers %s", (count, warning) => {
    expect(usageLevel(count!, 100).warning).toBe(warning);
  });
  it("does not round up into a warning prematurely", () => {
    expect(usageLevel(799, 1000).warning).toBeNull();
    expect(usageLevel(899, 1000).warning).toBe(80);
    expect(usageLevel(999, 1000).warning).toBe(90);
  });
  it("represents unlimited separately and blocks even empty zero quotas", () => {
    expect(usageLevel(100, unlimited)).toEqual({
      percent: null,
      warning: null,
    });
    expect(usageLevel(0, 0)).toEqual({ percent: 100, warning: 100 });
  });
});
