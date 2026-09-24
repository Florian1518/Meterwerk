-- Phase 5m Teil 3: tenantgebundene Dispositionserweiterungen und Storage-Lifecycle.
CREATE TYPE "WorkOrderAddendumStatus" AS ENUM ('DRAFT', 'REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED');

ALTER TABLE "Attachment"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'local';

CREATE TABLE "WorkOrderAddendum" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "estimatedMinutes" INTEGER,
  "material" JSONB NOT NULL DEFAULT '[]',
  "status" "WorkOrderAddendumStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkOrderAddendum_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkOrderAddendum_id_tenantId_key" ON "WorkOrderAddendum"("id", "tenantId");
CREATE INDEX "WorkOrderAddendum_tenantId_workOrderId_status_idx" ON "WorkOrderAddendum"("tenantId", "workOrderId", "status");
ALTER TABLE "WorkOrderAddendum" ADD CONSTRAINT "WorkOrderAddendum_workOrderId_tenantId_fkey" FOREIGN KEY ("workOrderId", "tenantId") REFERENCES "WorkOrder"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderAddendum" ADD CONSTRAINT "WorkOrderAddendum_createdById_tenantId_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
