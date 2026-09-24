CREATE TYPE "DeviceHealthStatus" AS ENUM ('HEALTHY','WARNING','CRITICAL','UNKNOWN');
CREATE TYPE "FirmwareRolloutStatus" AS ENUM ('DRAFT','SCHEDULED','RUNNING','PAUSED','COMPLETED','FAILED','CANCELED');
CREATE TABLE "FirmwareRollout" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "targetVersion" TEXT NOT NULL,
  "status" "FirmwareRolloutStatus" NOT NULL DEFAULT 'DRAFT', "windowStart" TIMESTAMP(3), "windowEnd" TIMESTAMP(3),
  "batchSize" INTEGER NOT NULL DEFAULT 1, "maxParallel" INTEGER NOT NULL DEFAULT 1, "canarySize" INTEGER NOT NULL DEFAULT 0,
  "pauseThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.25, "rollbackVersion" TEXT, "criteria" JSONB NOT NULL DEFAULT '{}',
  "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FirmwareRollout_pkey" PRIMARY KEY ("id"));
CREATE INDEX "FirmwareRollout_tenantId_status_idx" ON "FirmwareRollout"("tenantId","status");
CREATE TABLE "FirmwareRolloutTarget" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "rolloutId" TEXT NOT NULL, "deviceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "error" TEXT, "attemptedAt" TIMESTAMP(3),
  CONSTRAINT "FirmwareRolloutTarget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FirmwareRolloutTarget_rolloutId_fkey" FOREIGN KEY ("rolloutId") REFERENCES "FirmwareRollout"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FirmwareRolloutTarget_device_fkey" FOREIGN KEY ("deviceId","tenantId") REFERENCES "Device"("id","tenantId") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "FirmwareRolloutTarget_tenantId_rolloutId_deviceId_key" ON "FirmwareRolloutTarget"("tenantId","rolloutId","deviceId");
CREATE INDEX "FirmwareRolloutTarget_tenantId_deviceId_status_idx" ON "FirmwareRolloutTarget"("tenantId","deviceId","status");
CREATE TABLE "MaintenanceWindow" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "deviceId" TEXT, "gatewayId" TEXT, "groupSelector" JSONB NOT NULL DEFAULT '{}',
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "reason" TEXT NOT NULL, "comment" TEXT NOT NULL DEFAULT '',
  "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceWindow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceWindow_device_fkey" FOREIGN KEY ("deviceId","tenantId") REFERENCES "Device"("id","tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceWindow_gateway_fkey" FOREIGN KEY ("gatewayId","tenantId") REFERENCES "Gateway"("id","tenantId") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "MaintenanceWindow_tenantId_startsAt_endsAt_idx" ON "MaintenanceWindow"("tenantId","startsAt","endsAt");
CREATE INDEX "MaintenanceWindow_tenantId_deviceId_idx" ON "MaintenanceWindow"("tenantId","deviceId");
CREATE INDEX "MaintenanceWindow_tenantId_gatewayId_idx" ON "MaintenanceWindow"("tenantId","gatewayId");
