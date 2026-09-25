CREATE TABLE "BackupSchedule" (
  "id" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "cron" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "dailyKeep" INTEGER NOT NULL DEFAULT 7,
  "weeklyKeep" INTEGER NOT NULL DEFAULT 4,
  "monthlyKeep" INTEGER NOT NULL DEFAULT 12,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastStartedAt" TIMESTAMP(3),
  "lastCompletedAt" TIMESTAMP(3),
  "lastSuccessfulAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'IDLE',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackupSchedule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BackupSchedule_environment_key" ON "BackupSchedule"("environment");
CREATE TABLE "BackupObjectVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "objectKey" TEXT NOT NULL,
  "versionId" TEXT,
  "etag" TEXT,
  "sha256" TEXT,
  "sizeBytes" BIGINT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "backupId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "BackupObjectVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BackupObjectVersion_tenantId_objectKey_createdAt_idx" ON "BackupObjectVersion"("tenantId", "objectKey", "createdAt");
CREATE INDEX "BackupObjectVersion_backupId_idx" ON "BackupObjectVersion"("backupId");
