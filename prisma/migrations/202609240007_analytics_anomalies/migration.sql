CREATE TYPE "AnalyticsAnomalyStatus" AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED');
CREATE TABLE "AnalyticsAnomaly" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "meterId" TEXT NOT NULL, "propertyId" TEXT NOT NULL,
 "type" TEXT NOT NULL, "medium" "MeterType" NOT NULL, "severity" TEXT NOT NULL,
 "windowFrom" TIMESTAMP(3) NOT NULL, "windowTo" TIMESTAMP(3) NOT NULL,
 "measuredValue" DECIMAL(20,6) NOT NULL, "expectedValue" DECIMAL(20,6) NOT NULL,
 "deviationPercent" DECIMAL(20,6), "description" TEXT NOT NULL,
 "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "status" "AnalyticsAnomalyStatus" NOT NULL DEFAULT 'OPEN', "comment" TEXT,
 "resolvedAt" TIMESTAMP(3), "acknowledgedAt" TIMESTAMP(3), "fingerprint" TEXT NOT NULL,
 CONSTRAINT "AnalyticsAnomaly_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AnalyticsAnomaly_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "AnalyticsAnomaly_meterId_tenantId_fkey" FOREIGN KEY ("meterId","tenantId") REFERENCES "Meter"("id","tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AnalyticsAnomaly_tenantId_fingerprint_key" ON "AnalyticsAnomaly"("tenantId","fingerprint");
CREATE UNIQUE INDEX "AnalyticsAnomaly_id_tenantId_key" ON "AnalyticsAnomaly"("id","tenantId");
CREATE INDEX "AnalyticsAnomaly_tenantId_status_detectedAt_idx" ON "AnalyticsAnomaly"("tenantId","status","detectedAt");
CREATE INDEX "AnalyticsAnomaly_tenantId_meterId_windowFrom_windowTo_idx" ON "AnalyticsAnomaly"("tenantId","meterId","windowFrom","windowTo");
