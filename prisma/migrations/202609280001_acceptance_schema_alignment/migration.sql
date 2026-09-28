-- Align the migration-built database with the Prisma contract without deleting data or indexes.
ALTER TABLE "Dashboard" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "DrDrill" ALTER COLUMN "findings" SET DEFAULT '[]', ALTER COLUMN "actions" SET DEFAULT '[]';
ALTER TABLE "RuleExecution" ALTER COLUMN "correlationId" DROP DEFAULT;
ALTER TABLE "DeviceGroupMember" RENAME CONSTRAINT "DeviceGroupMember_device_fkey" TO "DeviceGroupMember_deviceId_tenantId_fkey";
ALTER TABLE "DeviceGroupMember" RENAME CONSTRAINT "DeviceGroupMember_group_fkey" TO "DeviceGroupMember_groupId_fkey";
ALTER TABLE "FirmwareRolloutTarget" RENAME CONSTRAINT "FirmwareRolloutTarget_device_fkey" TO "FirmwareRolloutTarget_deviceId_tenantId_fkey";
ALTER TABLE "Incident" RENAME CONSTRAINT "Incident_supportCase_fkey" TO "Incident_supportCaseId_fkey";
ALTER TABLE "IncidentEvent" RENAME CONSTRAINT "IncidentEvent_incident_fkey" TO "IncidentEvent_incidentId_fkey";
ALTER TABLE "MaintenanceWindow" RENAME CONSTRAINT "MaintenanceWindow_device_fkey" TO "MaintenanceWindow_deviceId_tenantId_fkey";
ALTER TABLE "MaintenanceWindow" RENAME CONSTRAINT "MaintenanceWindow_gateway_fkey" TO "MaintenanceWindow_gatewayId_tenantId_fkey";
ALTER TABLE "SupportCase" RENAME CONSTRAINT "SupportCase_tenant_fkey" TO "SupportCase_tenantId_fkey";
ALTER TABLE "SupportCaseEvent" RENAME CONSTRAINT "SupportCaseEvent_case_fkey" TO "SupportCaseEvent_caseId_tenantId_fkey";
