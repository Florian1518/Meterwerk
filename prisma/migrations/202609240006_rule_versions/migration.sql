ALTER TABLE "RuleExecution" ADD COLUMN "ruleVersion" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "RuleVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuleVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RuleVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RuleVersion_ruleId_tenantId_fkey" FOREIGN KEY ("ruleId", "tenantId") REFERENCES "Rule"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RuleVersion_id_tenantId_key" ON "RuleVersion"("id", "tenantId");
CREATE UNIQUE INDEX "RuleVersion_ruleId_tenantId_version_key" ON "RuleVersion"("ruleId", "tenantId", "version");
CREATE INDEX "RuleVersion_tenantId_ruleId_createdAt_idx" ON "RuleVersion"("tenantId", "ruleId", "createdAt");
