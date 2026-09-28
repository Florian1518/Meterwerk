-- Fail on pre-existing inconsistent references; never delete or silently reassign data.
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_propertyId_tenantId_fkey" FOREIGN KEY ("propertyId", "tenantId") REFERENCES "Property"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "Device"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_gatewayId_tenantId_fkey" FOREIGN KEY ("gatewayId", "tenantId") REFERENCES "Gateway"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_meterId_tenantId_fkey" FOREIGN KEY ("meterId", "tenantId") REFERENCES "Meter"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Global platform authors are intentional; foreign tenant-bound authors are not.
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM "Attachment" a JOIN "User" u ON u."id" = a."uploadedById"
  WHERE u."tenantId" IS DISTINCT FROM a."tenantId"
    AND NOT (u."tenantId" IS NULL AND u."role" = 'SUPER_ADMIN')
 ) THEN RAISE EXCEPTION 'Existing attachment uploader violates tenant boundary'; END IF;
END $$;
CREATE FUNCTION validate_attachment_uploader_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM "User" u WHERE u."id" = NEW."uploadedById"
    AND (u."tenantId" = NEW."tenantId" OR (u."tenantId" IS NULL AND u."role" = 'SUPER_ADMIN'))
 ) THEN RAISE EXCEPTION 'Attachment uploader must belong to tenant or global platform' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER attachment_uploader_tenant_check BEFORE INSERT OR UPDATE ON "Attachment" FOR EACH ROW EXECUTE FUNCTION validate_attachment_uploader_tenant();
