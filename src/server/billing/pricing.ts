import "server-only";
import { Decimal } from "decimal.js";
import type { Subscription } from "@/generated/prisma/client";

type Pricing = Pick<
  Subscription,
  | "pricingMode"
  | "priceAmount"
  | "basePriceAmount"
  | "pricePerMeterAmount"
  | "priceCurrency"
>;

/** Pure calculation; callers authorize and count the tenant's billable meters. */
export function calculateBilling(pricing: Pricing, billableMeterCount: number) {
  if (!Number.isSafeInteger(billableMeterCount) || billableMeterCount < 0)
    throw new Error("Ungültige Messpunktanzahl.");
  const base = pricing.basePriceAmount?.toString() ?? null;
  const perMeter = pricing.pricePerMeterAmount?.toString() ?? null;
  let meterCostAmount: string | null = null;
  let effectivePriceAmount = pricing.priceAmount?.toString() ?? null;
  if (pricing.pricingMode === "BASE_PLUS_METER") {
    if (base === null || perMeter === null)
      throw new Error("Grundpreis und Preis je Messpunkt fehlen.");
    // Decimal(12,2) multiplied by a safe integer can exceed default precision.
    const Money = Decimal.clone({ precision: 40 });
    const cost = new Money(perMeter).times(billableMeterCount);
    meterCostAmount = cost.toFixed(2);
    effectivePriceAmount = new Money(base).plus(cost).toFixed(2);
  }
  return {
    pricingMode: pricing.pricingMode,
    priceAmount: pricing.priceAmount?.toString() ?? null,
    basePriceAmount: base,
    pricePerMeterAmount: perMeter,
    priceCurrency: pricing.priceCurrency,
    billableMeterCount,
    meterCostAmount,
    effectivePriceAmount,
  };
}
