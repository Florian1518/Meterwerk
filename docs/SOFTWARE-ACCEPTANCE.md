# Software Acceptance

## Zweck und Baseline

Dieses Dokument definiert die nachvollziehbare Software-Abnahme für den Meterwerk v1.0 Release Candidate. Baseline bei Start von Phase 5v Teil 1: Commit `f444ea62207ed532b4329c29b9396e4703902ecc`, Branch `master`, Paketversion `0.1.0`; Ausgangsarbeitsbaum clean.

## Scope

Abnahme umfasst tenantfähige Plattform/Auth/Rollen, Metering und Auswertungen, Ingestion/Protokollcode, Portal, Automatisierung, Field Service, Device Management, Integrationen, Operations, Security, DR-Software, Demo/Staging-Guards, PWA, CI/CD und Dokumentation. Bewertung basiert auf Codeinspektion und tatsächlich ausgeführten Tests.

Nicht im lokalen Software-Scope: produktives Hosting, echte Kundendaten, echte Providerkonten, reales Mail-/Pushziel, produktives PITR, produktive Hochverfügbarkeit oder reale Hardware. Simulation und Unit-Test sind kein Nachweis dieser externen Eigenschaften.

## Statusklassen

- **IMPLEMENTED** — Code oder Konfiguration ist vorhanden.
- **VERIFIED** — angegebene Softwareprüfung wurde im notierten Lauf erfolgreich ausgeführt.
- **PARTIALLY_VERIFIED** — Teilpfade/automatisierte Tests liefen; vollständiger Bereich nicht abgedeckt.
- **EXTERNAL_VALIDATION_PENDING** — benötigt externen Provider, getrennte Infrastruktur oder produktionsähnliche Umgebung.
- **HARDWARE_VALIDATION_PENDING** — physische Geräteprüfung steht aus.
- **RELEASE_BLOCKER** — reproduzierbarer Softwarefehler verhindert Kernfunktion oder verletzt ein Releasekriterium.

Fehlerklassifikation zusätzlich: **MAJOR** wesentliche Fehlfunktion; **MINOR** kleinere Einschränkung; **KNOWN_LIMITATION** dokumentierte Grenze. Externe und Hardwarevalidierung sind für sich genommen keine Softwarefehler.

## Abnahmekategorien

Abnahme umfasst Platform/Tenant/Rollen/Auth; Strom/Wasser/Gas/Wärme, Readings und Meterwechsel; Connectivity/Profiles/Gateways/Edge; Dashboards/Analytics/Forecasts/Alarme/Reports; Rules; Field Service; Device/Fleet; Public API/Webhooks; Support/Operations; Security; Backup/DR; Demo/Staging; PWA; CI/CD und alle Handbücher.

Die Bestandsübersicht und Grenzen stehen in [Capabilities](CAPABILITIES.md) und [Known Limitations](KNOWN-LIMITATIONS.md). Detaillierte getestete Kategorien und Befehle sind in [Testing](TESTING.md). Release Candidate Prüfschritte stehen in der [RC Acceptance Checklist](checklists/RC-ACCEPTANCE-CHECKLIST.md).

Die Abnahme-Inventur differenziert weiter nach Komponenten: Platform/Auth/Rollen/Tenant, Metering/Reading/History/Tarife, Connectivity/Profile/Gateway/Edge, Portal/Analytics/Forecast/Alarm/Report, Rules, Field Service, Device/Fleet, API/Webhooks und Support/Operations sind softwareseitig implementiert, bleiben im Gesamtbereich **PARTIALLY_VERIFIED**, bis Datenbank- und HTTP-/E2E-Prüfungen gegen isolierte Systeme erfolgt sind. Die Security Regression Suite und Dependency Audit erhalten **VERIFIED** nur für die konkret ausgeführten Tests und den konkreten Lockfile-Stand. Clean Install/Upgrade bleibt bis zu einer eigenen Testdatenbank **NOT_EXECUTED**. Konkrete Providerumgebungen sind **EXTERNAL_VALIDATION_PENDING**; physische Geräte sind **HARDWARE_VALIDATION_PENDING**.

## Zentrales lokales Acceptance-Kommando

`pnpm acceptance:software` führt sichere lokale Checks aus: Prisma validate/generate, Typecheck, ESLint, Prettier, Unit Tests, Security Regression, Dokumentationschecks, Secret Scan, Dependency Audit und Produktionsbuild. Es löscht keine Datenbanken, verändert keine Production-Umgebung und benötigt keine echte Hardware. Ein Lauf erzeugt [Acceptance Result](acceptance/SOFTWARE-ACCEPTANCE-RESULT.md) mit Baseline und ausgeführten/nicht ausgeführten Kategorien.

PostgreSQL Clean Install/Upgrade, API-Integrationen, Browser-E2E, Docker/Staging, Providerchecks, PITR, reale Performance und Hardwaretests werden separat ausgeführt, nur gegen ausdrücklich isolierte Ressourcen. Nicht ausgeführte Kategorien bleiben `NOT_EXECUTED`, `EXTERNAL_VALIDATION_PENDING` oder `HARDWARE_VALIDATION_PENDING`.

## Release Candidate Kriterien

Ein RC ist erst freigabefähig, wenn lokale Qualitätsgates erfolgreich sind, Release-Blocker behoben sind, Datenbankmigrationen und Tenant-Isolation in geeigneter Testumgebung verifiziert sind, benötigte Browser/API-/Integrationsprüfungen durchgeführt oder begründet ausgenommen sind, externe/hardwareabhängige Grenzen offengelegt sind und Rollback sowie Release-Artefakt geprüft sind. Dieser Kriterienkatalog allein ist keine Freigabe und kein Nachweis für Production Readiness.
