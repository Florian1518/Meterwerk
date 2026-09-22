import { describe, expect, it } from "vitest";
import {
  calendarDate,
  currency,
  dateTime,
  decimal,
  measurement,
  utcInput,
  validTimeZone,
} from "../src/lib/format";
describe("Deutsche Darstellung und explizite Zeitzonen", () => {
  it("formatiert Decimal-Strings ohne Präzisionsverlust und alle Medien", () => {
    expect(decimal("123456789012345678.125")).toBe(
      "123.456.789.012.345.678,125",
    );
    expect(currency("1234.50")).toBe("1.234,50\u00a0€");
    for (const unit of ["kWh", "m³", "°C", "kW"])
      expect(measurement("1234.5", unit)).toBe(`1.234,5\u00a0${unit}`);
  });
  it("beachtet Tageswechsel sowie Sommer-/Winterzeit", () => {
    expect(dateTime("2026-10-25T00:30:00Z", "Europe/Berlin")).toContain(
      "GMT+2",
    );
    expect(dateTime("2026-10-25T01:30:00Z", "Europe/Berlin")).toContain(
      "GMT+1",
    );
    expect(dateTime("2026-03-29T00:30:00Z", "Europe/Berlin")).toContain(
      "01:30:00",
    );
    expect(dateTime("2026-03-29T01:30:00Z", "Europe/Berlin")).toContain(
      "03:30:00",
    );
    expect(dateTime("2026-10-25T02:30:00Z", "Europe/Berlin")).toContain(
      "03:30:00",
    );
    expect(calendarDate("2026-09-22T23:30:00Z", "Europe/Berlin")).toBe(
      "23.09.2026",
    );
    expect(calendarDate("2026-09-22T23:30:00Z", "America/New_York")).toBe(
      "22.09.2026",
    );
    expect(validTimeZone("invalid")).toBe("Europe/Berlin");
  });
  it("interpretiert als UTC beschriftete Eingaben unabhängig von der Laufzeit", () => {
    expect(utcInput("2026-09-22T12:30")).toBe("2026-09-22T12:30:00.000Z");
    expect(() => utcInput("2026-09-22")).toThrow();
  });
});
