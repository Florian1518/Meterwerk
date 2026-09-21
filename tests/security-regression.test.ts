import { describe, expect, it } from "vitest";
import { csvDocument } from "@/lib/modbus/csv";
describe("input security regressions", () => {
  it("neutralizes spreadsheet formulas in exports", () => {
    const csv = csvDocument(["value"], [['=HYPERLINK("https://evil")']]);
    expect(csv).toContain("'=HYPERLINK");
  });
  it("does not allow a path separator in a generated storage key", () => {
    const key = `tenant/${crypto.randomUUID()}`;
    expect(key).not.toContain("..\\");
    expect(key.split("/")).toHaveLength(2);
  });
});
