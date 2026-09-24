CREATE TYPE "DeviceLifecycleStatus" AS ENUM ('NEW', 'PROVISIONING', 'ACTIVE', 'OFFLINE', 'MAINTENANCE', 'DECOMMISSIONED', 'FAILED');

ALTER TABLE "Device"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "serialNumber" TEXT,
  ADD COLUMN "hardwareVersion" TEXT,
  ADD COLUMN "lifecycleStatus" "DeviceLifecycleStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "desiredFirmwareVersion" TEXT,
  ADD COLUMN "firmwareUpdateStatus" TEXT,
  ADD COLUMN "lastFirmwareAttemptAt" TIMESTAMP(3),
  ADD COLUMN "firmwareError" TEXT,
  ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Device_tenantId_lifecycleStatus_idx" ON "Device"("tenantId", "lifecycleStatus");
CREATE INDEX "Device_tenantId_manufacturer_model_idx" ON "Device"("tenantId", "manufacturer", "model");
CREATE INDEX "Device_tenantId_gatewayId_idx" ON "Device"("tenantId", "gatewayId");

CREATE TABLE "DeviceConfigurationVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "config" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceConfigurationVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeviceConfigurationVersion_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "Device"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DeviceConfigurationVersion_tenantId_deviceId_version_key" ON "DeviceConfigurationVersion"("tenantId", "deviceId", "version");
CREATE INDEX "DeviceConfigurationVersion_tenantId_deviceId_createdAt_idx" ON "DeviceConfigurationVersion"("tenantId", "deviceId", "createdAt");

CREATE TABLE "DeviceMaintenanceEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceMaintenanceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeviceMaintenanceEvent_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "Device"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DeviceMaintenanceEvent_tenantId_deviceId_createdAt_idx" ON "DeviceMaintenanceEvent"("tenantId", "deviceId", "createdAt");
