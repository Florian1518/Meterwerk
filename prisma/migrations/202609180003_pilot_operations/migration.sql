-- AlterTable
ALTER TABLE "Gateway" ADD COLUMN     "quarantineSize" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "queueDropped" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "queueSize" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "queueWarning" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GatewayCredential" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "keyFingerprint" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkerHealth" (
    "tenantId" TEXT NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL,
    "mqttConnected" BOOLEAN NOT NULL,
    "subscribed" BOOLEAN NOT NULL,
    "errorStreak" INTEGER NOT NULL DEFAULT 0,
    "lastIngestionAt" TIMESTAMP(3),

    CONSTRAINT "WorkerHealth_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "TechnicalAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "occurrences" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TechnicalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TechnicalAlert_tenantId_active_idx" ON "TechnicalAlert"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalAlert_tenantId_kind_entityId_key" ON "TechnicalAlert"("tenantId", "kind", "entityId");

-- AddForeignKey
ALTER TABLE "WorkerHealth" ADD CONSTRAINT "WorkerHealth_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalAlert" ADD CONSTRAINT "TechnicalAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
