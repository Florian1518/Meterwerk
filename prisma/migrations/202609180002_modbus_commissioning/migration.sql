-- CreateEnum
CREATE TYPE "CommissioningStatus" AS ENUM ('NOT_CONFIGURED', 'COMMISSIONING', 'ACTIVE', 'FAULT', 'DISABLED');

-- CreateTable
CREATE TABLE "ModbusConfiguration" (
    "deviceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "profile" JSONB NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "state" "CommissioningStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "step" INTEGER NOT NULL DEFAULT 1,
    "pollingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reviewedRevision" INTEGER,
    "confirmedUnitId" TEXT,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModbusConfiguration_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "ModbusDiagnostic" (
    "deviceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lastPollAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "responseMs" INTEGER,
    "lastError" TEXT,
    "successes" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB NOT NULL,

    CONSTRAINT "ModbusDiagnostic_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "TelemetrySample" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "error" TEXT,

    CONSTRAINT "TelemetrySample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalMeasurement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DECIMAL(20,6) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "TechnicalMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GatewayCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModbusConfiguration_tenantId_idx" ON "ModbusConfiguration"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ModbusConfiguration_deviceId_tenantId_key" ON "ModbusConfiguration"("deviceId", "tenantId");

-- CreateIndex
CREATE INDEX "ModbusDiagnostic_tenantId_idx" ON "ModbusDiagnostic"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ModbusDiagnostic_deviceId_tenantId_key" ON "ModbusDiagnostic"("deviceId", "tenantId");

-- CreateIndex
CREATE INDEX "TelemetrySample_tenantId_deviceId_timestamp_idx" ON "TelemetrySample"("tenantId", "deviceId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetrySample_id_tenantId_key" ON "TelemetrySample"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetrySample_tenantId_deviceId_messageId_key" ON "TelemetrySample"("tenantId", "deviceId", "messageId");

-- CreateIndex
CREATE INDEX "TechnicalMeasurement_tenantId_metric_idx" ON "TechnicalMeasurement"("tenantId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalMeasurement_sampleId_metric_key" ON "TechnicalMeasurement"("sampleId", "metric");

-- CreateIndex
CREATE INDEX "GatewayCommand_tenantId_gatewayId_status_idx" ON "GatewayCommand"("tenantId", "gatewayId", "status");

-- AddForeignKey
ALTER TABLE "ModbusConfiguration" ADD CONSTRAINT "ModbusConfiguration_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "Device"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModbusDiagnostic" ADD CONSTRAINT "ModbusDiagnostic_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "Device"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetrySample" ADD CONSTRAINT "TelemetrySample_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "Device"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalMeasurement" ADD CONSTRAINT "TechnicalMeasurement_sampleId_tenantId_fkey" FOREIGN KEY ("sampleId", "tenantId") REFERENCES "TelemetrySample"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayCommand" ADD CONSTRAINT "GatewayCommand_gatewayId_tenantId_fkey" FOREIGN KEY ("gatewayId", "tenantId") REFERENCES "Gateway"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayCommand" ADD CONSTRAINT "GatewayCommand_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "Device"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
