ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

ALTER TABLE "Plan"
  ADD COLUMN "monthlyPrice" DECIMAL(12,2),
  ADD COLUMN "yearlyPrice" DECIMAL(12,2),
  ADD COLUMN "priceCurrency" VARCHAR(3);

ALTER TABLE "Subscription"
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "priceAmount" DECIMAL(12,2),
  ADD COLUMN "priceCurrency" VARCHAR(3),
  ADD COLUMN "billingContactName" TEXT,
  ADD COLUMN "billingContactEmail" TEXT,
  ADD COLUMN "billingContactCompany" TEXT,
  ADD COLUMN "billingContactAddress" TEXT,
  ADD COLUMN "externalBillingId" TEXT;

CREATE UNIQUE INDEX "Subscription_externalBillingId_key" ON "Subscription"("externalBillingId");
