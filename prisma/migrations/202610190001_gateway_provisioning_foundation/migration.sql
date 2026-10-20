-- Additive transition only: no legacy property inference or lifecycle promotion.
CREATE TYPE "GatewayLifecycle" AS ENUM ('NEW', 'PROVISIONING', 'ACTIVE', 'MAINTENANCE', 'FAILED', 'DECOMMISSIONED');
ALTER TABLE "Gateway"
  ADD COLUMN "propertyId" TEXT,
  ADD COLUMN "lifecycleStatus" "GatewayLifecycle" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "provisioningStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN "firstContactAt" TIMESTAMPTZ(3),
  ADD COLUMN "commissionedAt" TIMESTAMPTZ(3),
  ADD COLUMN "decommissionedAt" TIMESTAMPTZ(3),
  ADD COLUMN "provisioningErrorCode" TEXT,
  ADD COLUMN "provisioningFailedAt" TIMESTAMPTZ(3),
  ALTER COLUMN "installedAt" DROP NOT NULL;
-- Existing installedAt values are retained as unverified legacy metadata.
-- Only a future explicit commissioning workflow can establish installation evidence.
ALTER TABLE "Gateway" ADD CONSTRAINT "Gateway_propertyId_tenantId_fkey"
  FOREIGN KEY ("propertyId", "tenantId") REFERENCES "Property"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Gateway" ADD CONSTRAINT "Gateway_revision_nonnegative" CHECK ("revision" >= 0);
CREATE INDEX "Gateway_tenantId_propertyId_idx" ON "Gateway"("tenantId", "propertyId");
CREATE INDEX "Gateway_tenantId_lifecycleStatus_idx" ON "Gateway"("tenantId", "lifecycleStatus");

CREATE TABLE "GatewayCommunicationIdentity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "gatewayId" TEXT NOT NULL,
  "brokerReference" TEXT NOT NULL,
  "certificateFingerprint" TEXT NOT NULL,
  "issuerReference" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "commonName" TEXT NOT NULL,
  "notBefore" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enabledConfirmedAt" TIMESTAMPTZ(3),
  "revocationRequestedAt" TIMESTAMPTZ(3),
  "revocationConfirmedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GatewayCommunicationIdentity_gatewayId_tenantId_fkey" FOREIGN KEY ("gatewayId", "tenantId") REFERENCES "Gateway"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GatewayCommunicationIdentity_fingerprint_format" CHECK ("certificateFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "GatewayCommunicationIdentity_common_name" CHECK ("commonName" = "gatewayId"),
  CONSTRAINT "GatewayCommunicationIdentity_validity" CHECK ("notBefore" < "expiresAt"),
  CONSTRAINT "GatewayCommunicationIdentity_revocation" CHECK ("revocationConfirmedAt" IS NULL OR ("revocationRequestedAt" IS NOT NULL AND "revocationConfirmedAt" >= "revocationRequestedAt"))
);
CREATE UNIQUE INDEX "GatewayCommunicationIdentity_certificateFingerprint_key" ON "GatewayCommunicationIdentity"("certificateFingerprint");
CREATE INDEX "GatewayCommunicationIdentity_tenantId_gatewayId_idx" ON "GatewayCommunicationIdentity"("tenantId", "gatewayId");

-- Backstop for existing command producers and future identity registration.
-- Same Gateway lock as ingestion/decommission; no broker-side claim is made.
CREATE FUNCTION meterwerk_reject_terminal_gateway_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state "GatewayLifecycle";
BEGIN
  IF TG_TABLE_NAME = 'GatewayCommand' THEN
    IF NEW."status" NOT IN ('PENDING', 'QUEUED', 'SENT', 'ACKNOWLEDGED') THEN RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME = 'GatewayCredential' THEN
    IF NEW."status" <> 'ACTIVE' THEN RETURN NEW; END IF;
  END IF;
  SELECT "lifecycleStatus" INTO state FROM "Gateway"
    WHERE "id" = NEW."gatewayId" AND "tenantId" = NEW."tenantId" FOR UPDATE;
  IF state = 'DECOMMISSIONED' THEN
    RAISE EXCEPTION 'Gateway is decommissioned' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gateway_command_terminal_guard BEFORE INSERT OR UPDATE OF "status", "gatewayId", "tenantId" ON "GatewayCommand"
  FOR EACH ROW EXECUTE FUNCTION meterwerk_reject_terminal_gateway_write();
CREATE TRIGGER gateway_credential_terminal_guard BEFORE INSERT OR UPDATE OF "status", "gatewayId", "tenantId" ON "GatewayCredential"
  FOR EACH ROW EXECUTE FUNCTION meterwerk_reject_terminal_gateway_write();
-- Updates that record an external revocation remain possible after decommission.
CREATE TRIGGER gateway_identity_terminal_guard BEFORE INSERT ON "GatewayCommunicationIdentity"
  FOR EACH ROW EXECUTE FUNCTION meterwerk_reject_terminal_gateway_write();
