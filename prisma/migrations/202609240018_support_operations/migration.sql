CREATE TYPE "SupportCaseCategory" AS ENUM ('ACCESS','BILLING','DEVICE','GATEWAY','METER','DATA','REPORTING','API','FIELD_SERVICE','OTHER');
CREATE TYPE "SupportCasePriority" AS ENUM ('LOW','NORMAL','HIGH','URGENT');
CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_INTERNAL','RESOLVED','CLOSED');
CREATE TABLE "SupportCase" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
 "category" "SupportCaseCategory" NOT NULL, "priority" "SupportCasePriority" NOT NULL DEFAULT 'NORMAL', "status" "SupportCaseStatus" NOT NULL DEFAULT 'OPEN',
 "reportedById" TEXT, "propertyId" TEXT, "deviceId" TEXT, "gatewayId" TEXT, "meterId" TEXT, "assignedToId" TEXT,
 "internalNotes" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "resolvedAt" TIMESTAMP(3),
 CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id"), CONSTRAINT "SupportCase_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "SupportCase_id_tenantId_key" ON "SupportCase"("id","tenantId");
CREATE INDEX "SupportCase_tenantId_status_priority_idx" ON "SupportCase"("tenantId","status","priority");
CREATE INDEX "SupportCase_tenantId_createdAt_idx" ON "SupportCase"("tenantId","createdAt");
CREATE TABLE "SupportCaseEvent" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "kind" TEXT NOT NULL, "body" TEXT NOT NULL, "internal" BOOLEAN NOT NULL DEFAULT false, "details" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SupportCaseEvent_pkey" PRIMARY KEY ("id"), CONSTRAINT "SupportCaseEvent_case_fkey" FOREIGN KEY ("caseId","tenantId") REFERENCES "SupportCase"("id","tenantId") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "SupportCaseEvent_tenantId_caseId_createdAt_idx" ON "SupportCaseEvent"("tenantId","caseId","createdAt");
CREATE TABLE "MaintenanceMode" ("id" TEXT NOT NULL, "tenantId" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT true, "reason" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endsAt" TIMESTAMP(3), "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MaintenanceMode_pkey" PRIMARY KEY ("id"));
CREATE INDEX "MaintenanceMode_tenantId_enabled_startsAt_idx" ON "MaintenanceMode"("tenantId","enabled","startsAt");
