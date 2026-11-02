CREATE TYPE "BillingPricingMode" AS ENUM ('FIXED', 'BASE_PLUS_METER');
ALTER TABLE "Subscription"
  ADD COLUMN "pricingMode" "BillingPricingMode" NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "basePriceAmount" DECIMAL(12,2),
  ADD COLUMN "pricePerMeterAmount" DECIMAL(12,2);
ALTER TABLE "Meter" ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT true;
-- Replaced meters remain non-billable, including intermediate meters in chains.
UPDATE "Meter" AS m SET "billable" = false
WHERE EXISTS (SELECT 1 FROM "MeterReplacement" AS r
  WHERE r."oldMeterId" = m."id" AND r."tenantId" = m."tenantId");
