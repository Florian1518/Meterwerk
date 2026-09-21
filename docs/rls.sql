-- Optionales Defense-in-Depth-Beispiel. Nicht ohne migrations-/transaktionssichere
-- Session-Kontextsetzung aktivieren. Die Anwendung bleibt die Autoritätsgrenze.
ALTER TABLE "Reading" ENABLE ROW LEVEL SECURITY;
CREATE POLICY meterwerk_reading_tenant ON "Reading"
  USING ("tenantId" = current_setting('meterwerk.tenant_id', true));
-- SET LOCAL meterwerk.tenant_id = '<authentifizierter Tenant>'; pro Transaktion.
