CREATE TYPE "RuleExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED');
ALTER TABLE "Rule"
  ADD COLUMN "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxExecutionsPerHour" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scheduleIntervalSeconds" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "nextScheduledAt" TIMESTAMP(3),
  ADD COLUMN "lastExecutedAt" TIMESTAMP(3);
ALTER TABLE "RuleExecution"
  ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "finishedAt" TIMESTAMP(3),
  ADD COLUMN "status" "RuleExecutionStatus" NOT NULL DEFAULT 'RUNNING',
  ADD COLUMN "executedActions" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "skippedActions" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "error" TEXT,
  ADD COLUMN "correlationId" TEXT NOT NULL DEFAULT '';
CREATE INDEX "Rule_tenantId_nextScheduledAt_idx" ON "Rule"("tenantId", "nextScheduledAt");
CREATE TABLE "RuleActionJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "correlationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuleActionJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RuleActionJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RuleActionJob_ruleId_tenantId_fkey" FOREIGN KEY ("ruleId", "tenantId") REFERENCES "Rule"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RuleActionJob_executionId_tenantId_fkey" FOREIGN KEY ("executionId", "tenantId") REFERENCES "RuleExecution"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RuleActionJob_id_tenantId_key" ON "RuleActionJob"("id", "tenantId");
CREATE INDEX "RuleActionJob_tenantId_status_nextAttemptAt_idx" ON "RuleActionJob"("tenantId", "status", "nextAttemptAt");
CREATE INDEX "RuleActionJob_tenantId_executionId_idx" ON "RuleActionJob"("tenantId", "executionId");
