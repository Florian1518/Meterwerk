-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "workOrderId" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "commissioning" JSONB,
ADD COLUMN     "documentation" JSONB,
ADD COLUMN     "replacementDetails" JSONB,
ADD COLUMN     "replacementId" TEXT,
ADD COLUMN     "requireCustomerSignature" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireTechnicianSignature" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WorkOrderEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "quantity" DECIMAL(20,6),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkOrderEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "WorkOrderType" NOT NULL,
    "medium" "MeterType" NOT NULL,
    "deviceProfileId" TEXT,
    "definition" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderEntry_tenantId_workOrderId_kind_idx" ON "WorkOrderEntry"("tenantId", "workOrderId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderEntry_id_tenantId_key" ON "WorkOrderEntry"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderReceipt_workOrderId_tenantId_requestId_key" ON "WorkOrderReceipt"("workOrderId", "tenantId", "requestId");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_tenantId_type_medium_idx" ON "ChecklistTemplate"("tenantId", "type", "medium");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_id_tenantId_key" ON "ChecklistTemplate"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_tenantId_workOrderId_requestId_key" ON "Attachment"("tenantId", "workOrderId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_replacementId_key" ON "WorkOrder"("replacementId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_replacementId_tenantId_key" ON "WorkOrder"("replacementId", "tenantId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workOrderId_tenantId_fkey" FOREIGN KEY ("workOrderId", "tenantId") REFERENCES "WorkOrder"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_replacementId_tenantId_fkey" FOREIGN KEY ("replacementId", "tenantId") REFERENCES "MeterReplacement"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderEntry" ADD CONSTRAINT "WorkOrderEntry_workOrderId_tenantId_fkey" FOREIGN KEY ("workOrderId", "tenantId") REFERENCES "WorkOrder"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderEntry" ADD CONSTRAINT "WorkOrderEntry_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderReceipt" ADD CONSTRAINT "WorkOrderReceipt_workOrderId_tenantId_fkey" FOREIGN KEY ("workOrderId", "tenantId") REFERENCES "WorkOrder"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_deviceProfileId_tenantId_fkey" FOREIGN KEY ("deviceProfileId", "tenantId") REFERENCES "DeviceProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
