import { describe, expect, it } from "vitest";
import {
  parseCsv,
  parseGermanDecimal,
  parseImportTimestamp,
} from "../src/lib/csv-import";

describe("CSV import parsing", () => {
  it("accepts UTF-8 BOM, semicolon delimiter, German values and quoted line breaks", () => {
    const parsed = parseCsv(
      '\uFEFFSeriennummer;Wert;Hinweis\r\n"A-1";"1.234,56";"Zeile 1\nZeile 2"\r\n',
    );
    expect(parsed.delimiter).toBe(";");
    expect(parsed.headers).toEqual(["Seriennummer", "Wert", "Hinweis"]);
    expect(parsed.rows).toEqual([["A-1", "1.234,56", "Zeile 1\nZeile 2"]]);
    expect(parseGermanDecimal(parsed.rows[0]![1]!)).toBe("1234.56");
  });

  it("supports comma-delimited English decimals and rejects malformed or ambiguous values", () => {
    expect(parseCsv("meterId,value\nm-1,12.5").rows).toEqual([["m-1", "12.5"]]);
    expect(parseGermanDecimal("1.234,56")).toBe("1234.56");
    expect(parseGermanDecimal("12,5")).toBe("12.5");
    expect(parseGermanDecimal("1.2.3,4")).toBeNull();
  });

  it("requires explicit timezone for date-times and normalizes accepted input to UTC", () => {
    expect(
      parseImportTimestamp("23.09.2026 14:30:00+02:00")?.toISOString(),
    ).toBe("2026-09-23T12:30:00.000Z");
    expect(parseImportTimestamp("2026-09-23T12:30:00Z")?.toISOString()).toBe(
      "2026-09-23T12:30:00.000Z",
    );
    expect(parseImportTimestamp("23.09.2026 14:30:00")).toBeNull();
    expect(parseImportTimestamp("31.02.2026")).toBeNull();
  });

  it("rejects malformed CSV structures and repeated headers", () => {
    expect(() => parseCsv("a;a\n1;2")).toThrow(/eindeutig/);
    expect(() => parseCsv('a;b\n"broken;row')).toThrow(/Anführungszeichen/);
    expect(() => parseCsv("a;b\n1")).toThrow(/Spaltenanzahl/);
  });
});
