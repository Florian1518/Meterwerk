CREATE TYPE "DeviceComplianceStatus" AS ENUM ('COMPLIANT','WARNING','NON_COMPLIANT','UNKNOWN');
CREATE TABLE "DeviceGroup" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
 "dynamic" BOOLEAN NOT NULL DEFAULT false, "filter" JSONB NOT NULL DEFAULT '{}', "tags" JSONB NOT NULL DEFAULT '[]',
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DeviceGroup_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DeviceGroup_tenantId_name_key" ON "DeviceGroup"("tenantId","name");
CREATE INDEX "DeviceGroup_tenantId_dynamic_idx" ON "DeviceGroup"("tenantId","dynamic");
CREATE TABLE "DeviceGroupMember" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "groupId" TEXT NOT NULL, "deviceId" TEXT NOT NULL,
 CONSTRAINT "DeviceGroupMember_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DeviceGroupMember_group_fkey" FOREIGN KEY ("groupId") REFERENCES "DeviceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DeviceGroupMember_device_fkey" FOREIGN KEY ("deviceId","tenantId") REFERENCES "Device"("id","tenantId") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "DeviceGroupMember_tenantId_groupId_deviceId_key" ON "DeviceGroupMember"("tenantId","groupId","deviceId");
CREATE INDEX "DeviceGroupMember_tenantId_deviceId_idx" ON "DeviceGroupMember"("tenantId","deviceId");
