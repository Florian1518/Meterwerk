-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'WARNING', 'MAINTENANCE', 'DISABLED');

-- CreateEnum
CREATE TYPE "DeviceProtocol" AS ENUM ('VIRTUAL', 'REST', 'MQTT', 'MODBUS', 'MBUS', 'WMBUS', 'LORAWAN', 'VENDOR_API');

-- CreateEnum
CREATE TYPE "DeviceTokenStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- AlterEnum
ALTER TYPE "Quality" ADD VALUE 'SUSPECT';

-- AlterTable
ALTER TABLE "Reading" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "meterValue" DECIMAL(20,6),
ADD COLUMN     "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Gateway" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalGatewayId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "firmwareVersion" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'MAINTENANCE',
    "lastSeenAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "gatewayId" TEXT,
    "externalDeviceId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "firmwareVersion" TEXT,
    "protocol" "DeviceProtocol" NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'MAINTENANCE',
    "lastSeenAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "DeviceTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gateway_tenantId_status_idx" ON "Gateway"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Gateway_id_tenantId_key" ON "Gateway"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Gateway_tenantId_externalGatewayId_key" ON "Gateway"("tenantId", "externalGatewayId");

-- CreateIndex
CREATE INDEX "Device_tenantId_meterId_idx" ON "Device"("tenantId", "meterId");

-- CreateIndex
CREATE INDEX "Device_tenantId_status_idx" ON "Device"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Device_id_tenantId_key" ON "Device"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tenantId_externalDeviceId_key" ON "Device"("tenantId", "externalDeviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCredential_tokenHash_key" ON "DeviceCredential"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceCredential_tenantId_deviceId_status_idx" ON "DeviceCredential"("tenantId", "deviceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Reading_tenantId_deviceId_messageId_key" ON "Reading"("tenantId", "deviceId", "messageId");

-- AddForeignKey
ALTER TABLE "Gateway" ADD CONSTRAINT "Gateway_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_meterId_tenantId_fkey" FOREIGN KEY ("meterId", "tenantId") REFERENCES "Meter"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_gatewayId_tenantId_fkey" FOREIGN KEY ("gatewayId", "tenantId") REFERENCES "Gateway"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCredential" ADD CONSTRAINT "DeviceCredential_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "Device"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reading" ADD CONSTRAINT "Reading_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "Device"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Device authentication rate limit bucket.
CREATE TABLE "DeviceRateLimit" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeviceRateLimit_pkey" PRIMARY KEY ("key")
);
