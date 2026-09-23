-- CreateEnum
CREATE TYPE "WorkOrderType" AS ENUM ('INSTALLATION', 'COMMISSIONING', 'MAINTENANCE', 'METER_REPLACEMENT', 'FAULT', 'INSPECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "WorkOrderType" NOT NULL,
    "priority" "WorkOrderPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "propertyId" TEXT NOT NULL,
    "buildingId" TEXT,
    "unitId" TEXT,
    "meterId" TEXT,
    "gatewayId" TEXT,
    "scheduledAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "internalContactId" TEXT,
    "customerContact" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicianAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderChecklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT NOT NULL DEFAULT '',
    "completedById" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrder_tenantId_status_scheduledAt_idx" ON "WorkOrder"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "WorkOrder_tenantId_propertyId_idx" ON "WorkOrder"("tenantId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_id_tenantId_key" ON "WorkOrder"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_tenantId_number_key" ON "WorkOrder"("tenantId", "number");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_tenantId_userId_idx" ON "TechnicianAssignment"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianAssignment_workOrderId_userId_key" ON "TechnicianAssignment"("workOrderId", "userId");

-- CreateIndex
CREATE INDEX "WorkOrderChecklist_tenantId_workOrderId_idx" ON "WorkOrderChecklist"("tenantId", "workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderChecklist_id_tenantId_key" ON "WorkOrderChecklist"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ChecklistItem_tenantId_checklistId_order_idx" ON "ChecklistItem"("tenantId", "checklistId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_id_tenantId_key" ON "ChecklistItem"("id", "tenantId");

-- CreateIndex
CREATE INDEX "WorkOrderComment_tenantId_workOrderId_createdAt_idx" ON "WorkOrderComment"("tenantId", "workOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_propertyId_tenantId_fkey" FOREIGN KEY ("propertyId", "tenantId") REFERENCES "Property"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_buildingId_tenantId_fkey" FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_unitId_tenantId_fkey" FOREIGN KEY ("unitId", "tenantId") REFERENCES "Unit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_meterId_tenantId_fkey" FOREIGN KEY ("meterId", "tenantId") REFERENCES "Meter"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_gatewayId_tenantId_fkey" FOREIGN KEY ("gatewayId", "tenantId") REFERENCES "Gateway"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_internalContactId_tenantId_fkey" FOREIGN KEY ("internalContactId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_workOrderId_tenantId_fkey" FOREIGN KEY ("workOrderId", "tenantId") REFERENCES "WorkOrder"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklist" ADD CONSTRAINT "WorkOrderChecklist_workOrderId_tenantId_fkey" FOREIGN KEY ("workOrderId", "tenantId") REFERENCES "WorkOrder"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_tenantId_fkey" FOREIGN KEY ("checklistId", "tenantId") REFERENCES "WorkOrderChecklist"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_completedById_tenantId_fkey" FOREIGN KEY ("completedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_workOrderId_tenantId_fkey" FOREIGN KEY ("workOrderId", "tenantId") REFERENCES "WorkOrder"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_authorId_tenantId_fkey" FOREIGN KEY ("authorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
