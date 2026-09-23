CREATE TABLE "PushSubscription" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "userId" TEXT NOT NULL, "endpoint" TEXT NOT NULL, "key" TEXT NOT NULL, "auth" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3),
 CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PushSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushSubscription_tenantId_endpoint_key" ON "PushSubscription"("tenantId","endpoint");
CREATE INDEX "PushSubscription_tenantId_userId_revokedAt_idx" ON "PushSubscription"("tenantId","userId","revokedAt");
