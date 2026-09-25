CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'DELETED');
CREATE TYPE "RestoreTestStatus" AS ENUM ('NOT_TESTED', 'TESTING', 'PASSED', 'FAILED');
CREATE TABLE "BackupRecord" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
  "appVersion" TEXT NOT NULL,
  "gitCommit" TEXT NOT NULL,
  "migrationVersion" TEXT NOT NULL,
  "sizeBytes" BIGINT,
  "sha256" TEXT,
  "storageReference" TEXT NOT NULL,
  "retentionExpiresAt" TIMESTAMP(3),
  "errorReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RestoreTestRun" (
  "id" TEXT NOT NULL,
  "backupId" TEXT NOT NULL,
  "targetDatabase" TEXT NOT NULL,
  "status" "RestoreTestStatus" NOT NULL DEFAULT 'NOT_TESTED',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "checks" JSONB NOT NULL DEFAULT '{}',
  "errorReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestoreTestRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestoreTestRun_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "BackupRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BackupRecord_environment_status_startedAt_idx" ON "BackupRecord"("environment", "status", "startedAt");
CREATE INDEX "RestoreTestRun_backupId_createdAt_idx" ON "RestoreTestRun"("backupId", "createdAt");
