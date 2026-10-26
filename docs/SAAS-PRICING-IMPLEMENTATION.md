# SaaS-Preisberechnung – Implementierungsbericht

Stand: 26.10.2026. Lokal abgenommen (LOCALLY ACCEPTED). Kein Push oder Deployment. Keine Staging-Datenbank verändert.

## Local Browser Acceptance

- Datum: 26.10.2026
- Ergebnis: **PASSED** – manuell durch den Benutzer bestätigt; **LOCALLY ACCEPTED**.
- SUPER_ADMIN-Vertragsverwaltung sichtbar; `FIXED` und `BASE_PLUS_METER` geprüft.
- TENANT_ADMIN read-only billing view unter `/billing` bzw. „Plan und Nutzung“ geprüft; keine Preisbearbeitung möglich.
- Beispielrechnung: 99,00 € + 25 × 4,00 € = 199,00 €/Monat.
- Reload und Persistenz geprüft.
- Die Beispielbeträge sind ausschließlich Abnahmewerte, keine Produktstandards oder Seed-Festwerte.

## Verhalten

- `FIXED` bleibt Standard und verwendet unverändert `priceAmount`, einschließlich `null`.
- `BASE_PLUS_METER` berechnet Grundpreis plus abrechenbare Messpunkte mal Messpunktpreis mit Decimal. Alle Beträge gelten direkt pro gewähltem Monat/Jahr, ohne Umrechnung.
- Kunden- und Plattformabfragen verwenden dieselbe Berechnung und einen konsistenten Datenbanksnapshot. Gesamtsummen und Messpunktkosten kommen vom Backend.
- Technischer Status beeinflusst `billable` nicht. Der Zählerwechsel setzt Altzähler auf `false` und Neuzähler auf `true`, atomar mit Wechsel und Audit.
- Nur SUPER_ADMIN ändert Preise. TENANT_ADMIN liest nur den eigenen Vertrag. USER/MANAGER erhalten keine Billing-Daten. Externe Billing-IDs fehlen in der Kundenprojektion.
- Energie-/Verbrauchstarife bleiben getrennt. Keine Rechnung oder Zahlung wird ausgelöst.

## Dateien dieses Auftrags

| Datei | Änderung |
| --- | --- |
| `prisma/schema.prisma` | Pricing-Enum, drei Subscription-Felder, `Meter.billable` |
| `prisma/migrations/202610260001_saas_pricing/migration.sql` | Additive Defaults und tenantgesicherter Altzähler-Backfill |
| `src/server/billing/pricing.ts` | Zentrale Decimal-Berechnung mit Dezimalstrings |
| `src/server/licensing.ts` | Beide Abfragen, Rollen-/Mandantenprüfung, Metadatenvalidierung |
| `src/server/meter-replacement.ts` | Atomare Abrechenbarkeit bei Wechsel |
| `src/components/billing-price-summary.tsx` | Gemeinsame, nicht editierbare Übersicht |
| `src/components/licensing-panel.tsx` | Preismodellauswahl und passende Eingabefelder |
| `src/components/tenant-billing-summary.tsx` | Kundenübersicht mit Preisen |
| `tests/licensing-integration.ts` | Neue Tests eingebunden, lokale Datenbankprüfung ergänzt |
| `tests/saas-pricing-integration.ts` | Isolierte Fixtures, Migration, Rollen, Isolation, Wechsel und Rollback |
| `tests/saas-pricing.test.ts` | Centgenauigkeit, hohe Beträge, Nullpreise, serverseitige Summen in UI |
| `tests/field-documentation.test.ts` | Bestehenden Wechseltest um beide Abrechenbarkeitsänderungen erweitert |
| `README.md`, `docs/ARCHITECTURE.md` | Betrieb, Semantik und Einschränkungen dokumentiert |
| `docs/SAAS-PRICING-IMPLEMENTATION.md` | Dieser Bericht |

Vorhandene Änderungen an Modbus, Benutzer-/Liegenschaftsverwaltung und weiteren Dateien wurden beibehalten; sie gehören nicht zu diesem Auftrag.

## Migration und lokale Datenbank

Die neue Migration erhält Festpreise und setzt Bestandsverträge auf `FIXED`. Alle Meter erhalten zunächst `billable=true`; alle als Altzähler referenzierten Meter werden tenantgesichert auf `false` gesetzt. Das gilt auch für Zwischenzähler einer Wechselkette. Messwerte werden nicht geändert oder gelöscht.

Die lokale Datenbank `localhost:5432/meterwerk` wurde gestartet. Dort wurden die neue Migration und sechs bereits ausstehende Repository-Migrationen angewandt: `202609260003_dr_drills`, `202609260004_demo_scenarios`, `202609280001_acceptance_schema_alignment`, `202609280002_acceptance_tenant_references`, `202609280003_demo_scenario_tenant` und `202610220001_modbus_commissioning_evidence`. Kein externes Datenbankziel wurde verwendet.

Ein zusätzlicher Migrationstest führt die neue SQL-Datei in einem transaktionalen Testschema gegen Bestandszeilen aus und rollt das Schema vollständig zurück. Er prüft unveränderte Festpreise/Nullpreise, Wechselketten und Tenant-Isolation. Neue Pricing-Fixtures werden nach dem Integrationstest entfernt; die bestehenden Licensing-Tests behalten ihr bisheriges Verhalten auf den lokalen Demo-Verträgen.

## Prüfergebnisse

`pnpm` war nicht im PATH verfügbar. Die entsprechenden installierten CLI-Einstiegspunkte wurden direkt mit Node ausgeführt.

| Prüfung | Ergebnis |
| --- | --- |
| Prisma generate | Bestanden, Prisma Client 7.10.0 |
| Billing-/Pricing-Vitest | 2 Dateien, 11 Tests bestanden |
| Licensing-Integration | 6 bestehende Checks sowie neue Pricing- und Migrationsprüfungen bestanden |
| TypeScript `tsc --noEmit` | Bestanden |
| ESLint gesamtes Repository | Bestanden |
| Vollständige Vitest-Suite | 47 Dateien, 367 Tests bestanden |
| Allgemeine Integration | 18 Checks bestanden |
| CSV-Import-Integration | 8 Checks bestanden |
| Data-Quality-Integration | 6 Checks bestanden |
| Rules-Integration | 7 Checks bestanden |
| Next.js Produktionsbuild | Bestanden, 69 statische Seiten generiert |
| `git diff --check` | Bestanden |
| `git status --short` | Vor dem lokalen SaaS-Pricing-Commit geprüft; fachfremde Änderungen bleiben uncommitted |

Die Windows-Sandbox verhinderte zunächst die Betriebssystem-Benutzerabfrage des TypeScript-Runners und der Embedded-Postgres-Tests. Diese Prüfungen wurden mit Freigabe außerhalb der Sandbox erfolgreich wiederholt. Ein bestehender Mock-Test erwartete nur die alte Statusänderung; nach Erweiterung um die beiden neuen `billable`-Änderungen war die gesamte Suite grün.

## Offene Punkte und Grenzen

- Keine offenen Implementierungsfehler aus den ausgeführten Prüfungen.
- Manueller Browser-/Sichttest durch den Benutzer bestanden; siehe „Local Browser Acceptance“.
- Bestehende Toolchain-Hinweise bleiben: esbuild/oxc-Konfiguration und eine pg-Deprecation für parallele Queries. Sie blockieren die Prüfungen nicht.
- Gezählt wird der aktuelle abrechenbare Bestand. Historische Stichtagsabrechnung, zeitanteilige Preise und Provider-Rechnungsstellung sind nicht Teil dieses Auftrags.
- Migration und Deployment außerhalb lokaler Testdatenbanken wurden ausdrücklich nicht ausgeführt.
