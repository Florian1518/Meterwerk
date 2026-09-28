DO $$ BEGIN CREATE TYPE "DashboardVisibility" AS ENUM ('PRIVATE','TENANT','ROLE_BASED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE "Dashboard" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL,
 "visibility" "DashboardVisibility" NOT NULL DEFAULT 'PRIVATE', "roles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[],
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Dashboard_id_tenantId_key" UNIQUE ("id","tenantId"),
 CONSTRAINT "Dashboard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "Dashboard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "DashboardWidget" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "dashboardId" TEXT NOT NULL, "title" TEXT NOT NULL, "type" TEXT NOT NULL, "dataSource" TEXT NOT NULL,
 "medium" "MeterType", "meterId" TEXT, "propertyId" TEXT, "period" TEXT NOT NULL, "aggregation" TEXT NOT NULL, "unit" TEXT,
 "display" JSONB NOT NULL DEFAULT '{}', "positionX" INTEGER NOT NULL DEFAULT 0, "positionY" INTEGER NOT NULL DEFAULT 0, "width" INTEGER NOT NULL DEFAULT 4, "height" INTEGER NOT NULL DEFAULT 3,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DashboardWidget_dashboardId_tenantId_fkey" FOREIGN KEY ("dashboardId","tenantId") REFERENCES "Dashboard"("id","tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
-- The UNIQUE table constraint above already creates this index.
CREATE UNIQUE INDEX IF NOT EXISTS "Dashboard_id_tenantId_key" ON "Dashboard"("id","tenantId");
CREATE INDEX "Dashboard_tenantId_visibility_idx" ON "Dashboard"("tenantId","visibility");
CREATE INDEX "Dashboard_tenantId_ownerId_idx" ON "Dashboard"("tenantId","ownerId");
CREATE UNIQUE INDEX "DashboardWidget_id_tenantId_key" ON "DashboardWidget"("id","tenantId");
CREATE INDEX "DashboardWidget_tenantId_dashboardId_positionY_positionX_idx" ON "DashboardWidget"("tenantId","dashboardId","positionY","positionX");
