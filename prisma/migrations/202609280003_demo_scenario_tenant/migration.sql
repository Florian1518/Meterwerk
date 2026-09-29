-- Legacy global selections are metadata only and remain unassigned.
ALTER TABLE "DemoScenarioState" ADD COLUMN "tenantId" TEXT;
DROP INDEX "DemoScenarioState_environment_key";
CREATE UNIQUE INDEX "DemoScenarioState_environment_tenantId_key" ON "DemoScenarioState"("environment", "tenantId");
ALTER TABLE "DemoScenarioState" ADD CONSTRAINT "DemoScenarioState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
