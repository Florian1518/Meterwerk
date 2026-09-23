ALTER TABLE "DataImport"
  ADD COLUMN "actorName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "fileName" TEXT NOT NULL DEFAULT 'Unbekannt (Altbestand)',
  ADD COLUMN "successCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "errorCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "skippedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "skippedRows" JSONB NOT NULL DEFAULT '[]';
UPDATE "DataImport" SET "successCount" = "rowCount" WHERE "status" = 'COMPLETED';
UPDATE "DataImport" SET "errorCount" = CASE
  WHEN EXISTS (SELECT 1 FROM jsonb_array_elements("errors") e WHERE (e->>'row')::int = 0)
  THEN "rowCount"
  ELSE (SELECT count(DISTINCT e->>'row') FROM jsonb_array_elements("errors") e)
END;
ALTER TABLE "DataQualityFinding"
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedBy" TEXT,
  ADD COLUMN "acknowledgementReason" TEXT;
CREATE INDEX "Reading_tenantId_id_idx" ON "Reading"("tenantId", "id");
ALTER TABLE "AuditEvent" ADD COLUMN "details" JSONB NOT NULL DEFAULT '{}';
