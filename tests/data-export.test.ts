import { describe, expect, it } from "vitest";
import { csvCell, csvLine, exportFilterSchema } from "../src/lib/data-export";
import { parseCsv } from "../src/lib/csv-import";

describe("CSV export contract", () => {
  it("escapes delimiters, quotes and line breaks without changing decimals", () => {
    expect(csvCell("-123.456789")).toBe('"-123.456789"');
    const line = csvLine(['Haus; "Nord"\nBerlin', "12345678901234.123456"]);
    expect(parseCsv("name;value\r\n" + line).rows[0]).toEqual([
      'Haus; "Nord"\nBerlin',
      "12345678901234.123456",
    ]);
  });
  it.each(["=1+1", "+cmd", "-cmd", "@SUM(A1)", " \t=1", "\r=1", "\n=1"])(
    "neutralizes spreadsheet formulas: %j",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );
  it("requires a real, explicit and ordered UTC/offset interval", () => {
    const valid = {
      from: "2026-01-01T00:00:00Z",
      to: "2026-02-01T00:00:00+01:00",
    };
    expect(exportFilterSchema.safeParse(valid).success).toBe(true);
    for (const override of [
      { from: valid.to },
      { from: "2026-02-30T00:00:00Z" },
      { from: "2026-01-01" },
      { medium: "OIL" },
    ])
      expect(
        exportFilterSchema.safeParse({ ...valid, ...override }).success,
      ).toBe(false);
  });
});
