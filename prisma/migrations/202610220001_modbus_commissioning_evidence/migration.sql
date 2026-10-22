ALTER TABLE "ModbusConfiguration"
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "assignedBy" TEXT,
  ADD COLUMN "completedBy" TEXT;

-- Preserve existing valid commissioning. Repair only the named test meter,
-- and only when evidence for its saved revision/gateway is missing.
WITH invalid AS (
  SELECT c."deviceId", c."tenantId", c."revision", c."state", c."completedAt"
  FROM "ModbusConfiguration" c
  JOIN "Device" d ON d.id = c."deviceId" AND d."tenantId" = c."tenantId"
  JOIN "Meter" m ON m.id = d."meterId" AND m."tenantId" = d."tenantId"
  WHERE m."serialNumber" = 'TEST-EL-001'
    AND (c.state = 'ACTIVE' OR c."completedAt" IS NOT NULL)
    AND (
      NOT EXISTS (SELECT 1 FROM "GatewayCommand" g
        WHERE g."deviceId" = c."deviceId" AND g."tenantId" = c."tenantId"
          AND g."gatewayId" = d."gatewayId" AND g.revision = c.revision
          AND g.action = 'TEST' AND g.status = 'SUCCEEDED'
          AND g.error IS NULL AND g."completedAt" IS NOT NULL)
      OR NOT EXISTS (SELECT 1 FROM "ModbusDiagnostic" x
        WHERE x."deviceId" = c."deviceId" AND x."tenantId" = c."tenantId"
          AND x.revision = c.revision AND x.successes >= 1
          AND x."lastSuccessAt" IS NOT NULL AND x."responseMs" IS NOT NULL)
      OR NOT EXISTS (SELECT 1 FROM "TelemetrySample" s
        JOIN "TechnicalMeasurement" v ON v."sampleId" = s.id AND v."tenantId" = s."tenantId"
        WHERE s."deviceId" = c."deviceId" AND s."tenantId" = c."tenantId"
          AND s.revision = c.revision AND s.error IS NULL)
    )
), audited AS (
  INSERT INTO "AuditEvent" (id, "tenantId", "actorId", action, "entityId", details, "createdAt")
  SELECT 'commissioning-repair-' || "deviceId", "tenantId", 'migration:202610220001',
    'modbus.commissioning.integrity-repair', "deviceId",
    jsonb_build_object('revision', revision, 'previousState', state, 'previousCompletedAt', "completedAt", 'reason', 'Missing technical evidence'), CURRENT_TIMESTAMP
  FROM invalid RETURNING "entityId"
)
UPDATE "ModbusConfiguration" c SET state = 'COMMISSIONING', step = 6,
  "pollingEnabled" = false, "reviewedRevision" = NULL, "confirmedUnitId" = NULL,
  "completedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
FROM audited a WHERE c."deviceId" = a."entityId";
