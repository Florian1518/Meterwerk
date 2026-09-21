-- Legacy readings are already stored in canonical meter units. Preserve that
-- recorded value; no unavailable device raw registers are fabricated.
INSERT INTO "Measurement" ("id","tenantId","readingId","metric","rawValue","rawUnit","value","unit","quality")
SELECT r."id" || '-primary', r."tenantId", r."id",
 CASE m."type" WHEN 'ELECTRICITY' THEN 'ENERGY_IMPORT' WHEN 'HEAT' THEN 'ENERGY_TOTAL' ELSE 'VOLUME_TOTAL' END,
 r."registerValue", r."measurementUnit", r."registerValue",
 CASE WHEN m."type" IN ('WATER','GAS') THEN 'm3' ELSE 'kWh' END, r."quality"
FROM "Reading" r JOIN "Meter" m ON m."id"=r."meterId" AND m."tenantId"=r."tenantId"
WHERE NOT EXISTS (SELECT 1 FROM "Measurement" x WHERE x."readingId"=r."id")
ON CONFLICT DO NOTHING;
