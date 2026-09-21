ALTER TABLE "Meter" ADD COLUMN "utilityConfig" JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX "Reading_id_tenantId_key" ON "Reading"("id", "tenantId");
CREATE TABLE "Measurement" (
 "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "readingId" TEXT NOT NULL,
 "metric" TEXT NOT NULL, "rawValue" DECIMAL(20,6) NOT NULL, "rawUnit" TEXT NOT NULL,
 "value" DECIMAL(20,6) NOT NULL, "unit" TEXT NOT NULL, "quality" "Quality" NOT NULL,
 CONSTRAINT "Measurement_readingId_tenantId_fkey" FOREIGN KEY ("readingId","tenantId") REFERENCES "Reading"("id","tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Measurement_readingId_metric_key" ON "Measurement"("readingId","metric");
CREATE INDEX "Measurement_tenantId_metric_idx" ON "Measurement"("tenantId","metric");
CREATE TABLE "Tariff" (
 "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "meterId" TEXT, "utility" "MeterType" NOT NULL,
 "validFrom" TIMESTAMP(3) NOT NULL, "validTo" TIMESTAMP(3), "unit" TEXT NOT NULL,
 "price" DECIMAL(20,6) NOT NULL, "basePerDay" DECIMAL(20,6) NOT NULL DEFAULT 0,
 "condition" DECIMAL(12,6), "calorific" DECIMAL(12,6),
 CONSTRAINT "Tariff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "Tariff_meterId_tenantId_fkey" FOREIGN KEY ("meterId","tenantId") REFERENCES "Meter"("id","tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "Tariff_valid" CHECK ("price">=0 AND "basePerDay">=0 AND ("validTo" IS NULL OR "validTo">"validFrom") AND ("condition" IS NULL OR "condition">0) AND ("calorific" IS NULL OR "calorific">0)),
 CONSTRAINT "Tariff_unit" CHECK (("utility"='ELECTRICITY' AND "unit"='kWh') OR ("utility"='WATER' AND "unit"='m3') OR ("utility"='GAS' AND ("unit"='m3' OR ("unit"='kWh' AND "condition" IS NOT NULL AND "calorific" IS NOT NULL))) OR ("utility"='HEAT' AND "unit" IN ('kWh','MWh')))
);
CREATE INDEX "Tariff_tenantId_utility_validFrom_idx" ON "Tariff"("tenantId","utility","validFrom");
