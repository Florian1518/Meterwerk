CREATE TABLE "PublicApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "PublicApiKey_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PublicApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PublicApiKey_keyHash_key" ON "PublicApiKey"("keyHash");
CREATE UNIQUE INDEX "PublicApiKey_id_tenantId_key" ON "PublicApiKey"("id", "tenantId");
CREATE INDEX "PublicApiKey_tenantId_createdAt_idx" ON "PublicApiKey"("tenantId", "createdAt");

CREATE TABLE "PublicApiRateLimit" (
    "keyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublicApiRateLimit_pkey" PRIMARY KEY ("keyId"),
    CONSTRAINT "PublicApiRateLimit_keyId_tenantId_fkey" FOREIGN KEY ("keyId", "tenantId") REFERENCES "PublicApiKey"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PublicApiRateLimit_keyId_tenantId_key" ON "PublicApiRateLimit"("keyId", "tenantId");
CREATE INDEX "PublicApiRateLimit_tenantId_idx" ON "PublicApiRateLimit"("tenantId");
