import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ConsumptionChart } from "../src/components/chart";
describe("SVG chart hydration regression", () => {
  it.each([0, 1, 7, 90])(
    "renders %i days without invalid coordinates or missing ticks",
    (count) => {
      const days = Array.from({ length: count }, (_, i) => ({
        date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
        value: i,
      }));
      const html = renderToString(
        createElement(ConsumptionChart, { days, unit: "kWh" }),
      );
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
      expect(html).toContain(`${count} Tage`);
    },
  );
  it("renders every SVG title as one complete server-side string without React warnings", () => {
    const warnings = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const days = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-09-${String(i + 1).padStart(2, "0")}`,
        value: 1234.5,
      }));
      const html = renderToString(
        createElement(ConsumptionChart, { days, unit: "kWh" }),
      );
      expect(html).toContain("<title>2026-09-01: 1.234,5 kWh</title>");
      expect(html.match(/<title>/g)).toHaveLength(30);
      expect(warnings).not.toHaveBeenCalled();
    } finally {
      warnings.mockRestore();
    }
  });
  it("renders zero-consumption portfolios without NaN or Infinity", () => {
    const days = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      value: 0,
    }));
    const html = renderToString(
      createElement(ConsumptionChart, { days, unit: "m³" }),
    );
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain("0 m³</title>");
  });
});
