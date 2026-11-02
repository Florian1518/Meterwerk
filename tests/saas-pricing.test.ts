import { describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client";
import { calculateBilling } from "../src/server/billing/pricing";
import { BillingPriceSummary } from "../src/components/billing-price-summary";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const pricing = {
  pricingMode: "BASE_PLUS_METER" as const,
  priceAmount: new Prisma.Decimal("49.99"),
  basePriceAmount: new Prisma.Decimal("0.10"),
  pricePerMeterAmount: new Prisma.Decimal("0.20"),
  priceCurrency: "EUR",
};
describe("SaaS decimal pricing", () => {
  it("preserves FIXED and nullable legacy agreements regardless of meter count", () => {
    expect(
      calculateBilling({ ...pricing, pricingMode: "FIXED" }, 500)
        .effectivePriceAmount,
    ).toBe("49.99");
    expect(
      calculateBilling(
        { ...pricing, pricingMode: "FIXED", priceAmount: null },
        500,
      ).effectivePriceAmount,
    ).toBeNull();
  });
  it.each([
    [0, "0.10"],
    [1, "0.30"],
    [3, "0.70"],
    [999, "199.90"],
  ])("calculates %i meters exactly", (count, amount) => {
    expect(calculateBilling(pricing, count).effectivePriceAmount).toBe(amount);
  });
  it("retains cents even for totals beyond binary float precision", () => {
    const result = calculateBilling(
      {
        ...pricing,
        basePriceAmount: new Prisma.Decimal("9999999999.99"),
        pricePerMeterAmount: new Prisma.Decimal("9999999999.99"),
      },
      999999999,
    );
    expect(result.effectivePriceAmount).toBe("9999999999990000000.00");
  });
  it("rejects missing automatic prices and invalid counts", () => {
    expect(() =>
      calculateBilling({ ...pricing, basePriceAmount: null }, 0),
    ).toThrow();
    expect(() =>
      calculateBilling({ ...pricing, pricePerMeterAmount: null }, 0),
    ).toThrow();
    for (const count of [-1, 0.5, NaN, Infinity])
      expect(() => calculateBilling(pricing, count)).toThrow();
  });
  it("renders server totals, units and exact German money without editing controls", () => {
    const html = renderToStaticMarkup(
      createElement(BillingPriceSummary, {
        data: {
          ...calculateBilling(pricing, 3),
          effectivePriceAmount: "1234.56",
          billingInterval: "YEARLY",
        },
      }),
    );
    expect(html).toContain("1.234,56 €");
    expect(html).toContain("Jahr");
    expect(html).toContain("Grundpreis");
    expect(html).toContain("Messpunktkosten");
    expect(html).not.toMatch(/input|button|externalBillingId/);
  });
});
