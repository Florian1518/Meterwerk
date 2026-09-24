-- Query paths used by tenant-scoped time-series and alarm queues.
ALTER TABLE "WebhookDelivery" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "RuleActionJob" ADD COLUMN "leaseOwner" TEXT;

CREATE INDEX "Reading_tenantId_meterId_timestamp_idx"
  ON "Reading" ("tenantId", "meterId", "timestamp");

CREATE INDEX "Reading_tenantId_deviceId_timestamp_idx"
  ON "Reading" ("tenantId", "deviceId", "timestamp");

CREATE INDEX "Alarm_tenantId_status_createdAt_idx"
  ON "Alarm" ("tenantId", "status", "createdAt");

CREATE INDEX "FirmwareRollout_tenantId_status_createdAt_idx"
  ON "FirmwareRollout" ("tenantId", "status", "createdAt");

CREATE INDEX "FirmwareRolloutTarget_tenantId_rolloutId_status_idx"
  ON "FirmwareRolloutTarget" ("tenantId", "rolloutId", "status");
