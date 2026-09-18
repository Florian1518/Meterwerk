CREATE TABLE "GatewayCredential" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "gatewayId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "status" "DeviceTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GatewayCredential_gateway_tenant_fkey" FOREIGN KEY ("gatewayId", "tenantId") REFERENCES "Gateway"("id", "tenantId") ON DELETE CASCADE
);
CREATE INDEX "GatewayCredential_tenantId_gatewayId_idx" ON "GatewayCredential"("tenantId", "gatewayId");
