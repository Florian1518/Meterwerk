CREATE TYPE "DataQualityStatus" AS ENUM ('OK', 'WARNING', 'ERROR');
CREATE TYPE "DataQualityIssueType" AS ENUM ('MISSING_READINGS', 'DUPLICATE_READINGS', 'TIMESTAMP_OUT_OF_RANGE', 'NEGATIVE_CONSUMPTION', 'UNUSUAL_JUMP', 'COUNTER_ROLLBACK', 'UNIT_MISMATCH', 'ORPHANED_ASSIGNMENT', 'DATA_GAP');
CREATE TYPE "DataCorrectionAction" AS ENUM ('CORRECT', 'MARK_INVALID', 'REPLACE');

CREATE TABLE "DataQualityFinding" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "meterId" TEXT NOT NULL,
  "readingId" TEXT,
  "type" "DataQualityIssueType" NOT NULL,
  "status" "DataQualityStatus" NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}',
  "windowFrom" TIMESTAMP(3) NOT NULL,
  "windowTo" TIMESTAMP(3) NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "DataQualityFinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataQualityFinding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DataQualityFinding_meterId_tenantId_fkey" FOREIGN KEY ("meterId", "tenantId") REFERENCES "Meter"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DataQualityFinding_readingId_tenantId_fkey" FOREIGN KEY ("readingId", "tenantId") REFERENCES "Reading"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DataQualityCorrection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "readingId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" "DataCorrectionAction" NOT NULL,
  "reason" TEXT NOT NULL,
  "beforeData" JSONB NOT NULL,
  "afterData" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataQualityCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataQualityCorrection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DataQualityCorrection_readingId_tenantId_fkey" FOREIGN KEY ("readingId", "tenantId") REFERENCES "Reading"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DataQualityFinding_tenantId_fingerprint_key" ON "DataQualityFinding"("tenantId", "fingerprint");
CREATE UNIQUE INDEX "DataQualityFinding_id_tenantId_key" ON "DataQualityFinding"("id", "tenantId");
CREATE INDEX "DataQualityFinding_tenantId_status_type_resolvedAt_idx" ON "DataQualityFinding"("tenantId", "status", "type", "resolvedAt");
CREATE INDEX "DataQualityFinding_tenantId_meterId_windowFrom_windowTo_idx" ON "DataQualityFinding"("tenantId", "meterId", "windowFrom", "windowTo");
CREATE UNIQUE INDEX "DataQualityCorrection_id_tenantId_key" ON "DataQualityCorrection"("id", "tenantId");
CREATE INDEX "DataQualityCorrection_tenantId_readingId_createdAt_idx" ON "DataQualityCorrection"("tenantId", "readingId", "createdAt");
