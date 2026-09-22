CREATE TABLE "DataImport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "stagedData" JSONB NOT NULL,
  "errors" JSONB NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREVIEWED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DataImport_id_tenantId_key" ON "DataImport"("id", "tenantId");
CREATE INDEX "DataImport_tenantId_createdAt_idx" ON "DataImport"("tenantId", "createdAt");
CREATE INDEX "DataImport_tenantId_fingerprint_idx" ON "DataImport"("tenantId", "fingerprint");
