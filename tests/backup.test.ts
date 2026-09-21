import { describe, expect, it } from "vitest";
import { restoreName } from "../scripts/backup";
describe("backup safety", () => {
  it("only permits restoring into a new dedicated database", () => {
    expect(restoreName("meterwerk_restore_test_2026")).toBe(
      "meterwerk_restore_test_2026",
    );
    expect(() => restoreName("meterwerk")).toThrow();
    expect(() => restoreName("postgres")).toThrow();
  });
});
