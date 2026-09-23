DO $$ BEGIN ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_id_tenantId_key" UNIQUE ("id","tenantId"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "DashboardWidget" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "dashboardId" TEXT NOT NULL, "title" TEXT NOT NULL, "type" TEXT NOT NULL, "dataSource" TEXT NOT NULL,
 "medium" "MeterType", "meterId" TEXT, "propertyId" TEXT, "period" TEXT NOT NULL, "aggregation" TEXT NOT NULL, "unit" TEXT,
 "display" JSONB NOT NULL DEFAULT '{}', "positionX" INTEGER NOT NULL DEFAULT 0, "positionY" INTEGER NOT NULL DEFAULT 0, "width" INTEGER NOT NULL DEFAULT 4, "height" INTEGER NOT NULL DEFAULT 3,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DashboardWidget_dashboardId_tenantId_fkey" FOREIGN KEY ("dashboardId","tenantId") REFERENCES "Dashboard"("id","tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Dashboard_id_tenantId_key" ON "Dashboard"("id","tenantId");
CREATE INDEX IF NOT EXISTS "Dashboard_tenantId_visibility_idx" ON "Dashboard"("tenantId","visibility");
CREATE INDEX IF NOT EXISTS "Dashboard_tenantId_ownerId_idx" ON "Dashboard"("tenantId","ownerId");
CREATE UNIQUE INDEX IF NOT EXISTS "DashboardWidget_id_tenantId_key" ON "DashboardWidget"("id","tenantId");
CREATE INDEX IF NOT EXISTS "DashboardWidget_tenantId_dashboardId_positionY_positionX_idx" ON "DashboardWidget"("tenantId","dashboardId","positionY","positionX");
