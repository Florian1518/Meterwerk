CREATE TYPE "RuleTrigger" AS ENUM ('READING_CREATED', 'ALARM_CREATED', 'ALARM_STATUS_CHANGED', 'METER_ONLINE', 'METER_OFFLINE', 'GATEWAY_ONLINE', 'GATEWAY_OFFLINE', 'SCHEDULED_CHECK');
CREATE TABLE "Rule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "propertyId" TEXT,
  "meterId" TEXT,
  "gatewayId" TEXT,
  "medium" "MeterType",
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "trigger" "RuleTrigger" NOT NULL,
  "conditions" JSONB NOT NULL DEFAULT '[]',
  "actions" JSONB NOT NULL DEFAULT '[]',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Rule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Rule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Rule_propertyId_tenantId_fkey" FOREIGN KEY ("propertyId", "tenantId") REFERENCES "Property"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Rule_meterId_tenantId_fkey" FOREIGN KEY ("meterId", "tenantId") REFERENCES "Meter"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Rule_gatewayId_tenantId_fkey" FOREIGN KEY ("gatewayId", "tenantId") REFERENCES "Gateway"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Rule_id_tenantId_key" ON "Rule"("id", "tenantId");
CREATE INDEX "Rule_tenantId_active_priority_idx" ON "Rule"("tenantId", "active", "priority");
CREATE INDEX "Rule_tenantId_trigger_active_idx" ON "Rule"("tenantId", "trigger", "active");
CREATE TABLE "RuleExecution" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "trigger" "RuleTrigger" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "matched" BOOLEAN NOT NULL,
  "actionCount" INTEGER NOT NULL DEFAULT 0,
  "details" JSONB NOT NULL DEFAULT '{}',
  "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuleExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RuleExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RuleExecution_ruleId_tenantId_fkey" FOREIGN KEY ("ruleId", "tenantId") REFERENCES "Rule"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RuleExecution_id_tenantId_key" ON "RuleExecution"("id", "tenantId");
CREATE INDEX "RuleExecution_tenantId_ruleId_executedAt_idx" ON "RuleExecution"("tenantId", "ruleId", "executedAt");
CREATE INDEX "RuleExecution_tenantId_eventKey_idx" ON "RuleExecution"("tenantId", "eventKey");
