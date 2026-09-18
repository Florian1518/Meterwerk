-- Enforce invariants even for administrative SQL and future ingestion workers.
ALTER TABLE "User" ADD CONSTRAINT "User_role_tenant_check" CHECK (
  ("role" = 'SUPER_ADMIN' AND "tenantId" IS NULL) OR
  ("role" <> 'SUPER_ADMIN' AND "tenantId" IS NOT NULL)
);
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_area_nonnegative" CHECK ("area" >= 0);
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_price_nonnegative" CHECK ("demoPricePerUnit" >= 0);
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_unit_matches_type" CHECK (
  ("type" IN ('ELECTRICITY', 'HEAT') AND "measurementUnit" = 'kWh') OR
  ("type" IN ('WATER', 'GAS') AND "measurementUnit" = 'm³')
);
ALTER TABLE "Reading" ADD CONSTRAINT "Reading_values_nonnegative" CHECK ("consumption" >= 0 AND "registerValue" >= 0);
ALTER TABLE "Alarm" ADD CONSTRAINT "Alarm_severity_valid" CHECK ("severity" IN ('HIGH', 'MEDIUM', 'LOW'));
CREATE FUNCTION validate_reading_unit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Meter" WHERE "id" = NEW."meterId" AND "tenantId" = NEW."tenantId" AND "measurementUnit" = NEW."measurementUnit") THEN
    RAISE EXCEPTION 'Reading unit must match meter unit' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reading_unit_check BEFORE INSERT OR UPDATE ON "Reading" FOR EACH ROW EXECUTE FUNCTION validate_reading_unit();
