CREATE TYPE "PlanCode" AS ENUM ('BASIC', 'PROFESSIONAL', 'ENTERPRISE');
CREATE TYPE "FeatureKey" AS ENUM ('REPORTING', 'ANALYTICS', 'API', 'WEBHOOKS', 'ADVANCED_EXPORTS');
CREATE TYPE "SupportLevel" AS ENUM ('STANDARD', 'PRIORITY', 'DEDICATED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELED', 'EXPIRED');

CREATE TABLE "Plan" (
  "id" TEXT NOT NULL,
  "code" "PlanCode" NOT NULL,
  "name" TEXT NOT NULL,
  "maxProperties" INTEGER NOT NULL,
  "maxMeters" INTEGER NOT NULL,
  "maxUsers" INTEGER NOT NULL,
  "maxGateways" INTEGER NOT NULL,
  "supportLevel" "SupportLevel" NOT NULL DEFAULT 'STANDARD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

CREATE TABLE "PlanFeature" (
  "planId" TEXT NOT NULL,
  "feature" "FeatureKey" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("planId", "feature"),
  CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Subscription_tenantId_status_startsAt_idx" ON "Subscription"("tenantId", "status", "startsAt");
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

CREATE TABLE "TenantFeatureOverride" (
  "tenantId" TEXT NOT NULL,
  "feature" "FeatureKey" NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantFeatureOverride_pkey" PRIMARY KEY ("tenantId", "feature"),
  CONSTRAINT "TenantFeatureOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TenantPlanOverride" (
  "tenantId" TEXT NOT NULL,
  "maxProperties" INTEGER,
  "maxMeters" INTEGER,
  "maxUsers" INTEGER,
  "maxGateways" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantPlanOverride_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "TenantPlanOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "Plan" ("id", "code", "name", "maxProperties", "maxMeters", "maxUsers", "maxGateways", "supportLevel", "updatedAt") VALUES
  ('plan-basic', 'BASIC', 'Basic', 5, 100, 5, 1, 'STANDARD', CURRENT_TIMESTAMP),
  ('plan-professional', 'PROFESSIONAL', 'Professional', 50, 2000, 25, 10, 'PRIORITY', CURRENT_TIMESTAMP),
  ('plan-enterprise', 'ENTERPRISE', 'Enterprise', 2147483647, 2147483647, 2147483647, 2147483647, 'DEDICATED', CURRENT_TIMESTAMP);
INSERT INTO "PlanFeature" ("planId", "feature", "enabled")
SELECT p."id", f."feature"::"FeatureKey", CASE
  WHEN p."code" = 'BASIC' AND f."feature" IN ('REPORTING', 'API') THEN true
  WHEN p."code" IN ('PROFESSIONAL', 'ENTERPRISE') THEN true
  ELSE false END
FROM "Plan" p CROSS JOIN (VALUES ('REPORTING'), ('ANALYTICS'), ('API'), ('WEBHOOKS'), ('ADVANCED_EXPORTS')) f("feature");
INSERT INTO "Subscription" ("id", "tenantId", "planId", "status", "updatedAt")
SELECT 'subscription-' || t."id", t."id", 'plan-basic', 'ACTIVE', CURRENT_TIMESTAMP FROM "Tenant" t;
