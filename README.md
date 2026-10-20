# Meterwerk

Meterwerk ist eine mandantenfähige Webanwendung zur Verwaltung und Auswertung von Zählern für Strom, Wasser, Gas und Wärme. Sie umfasst Benutzer- und Tenantverwaltung, Messwerte, Dashboards und Analytics, Regeln/Alarme, Reports, Geräte/Gateways, WorkOrders, Support, Public API, Webhooks und Operations.

Die Anwendung basiert auf Next.js App Router, TypeScript, PostgreSQL und Prisma. Ein MQTT-Ingestion-Prozess und ein optionales Edge Gateway ergänzen den Webprozess. Die fachliche Wahrheit liegt in PostgreSQL; produktive Integrationen benötigen getrennte, sicher konfigurierte Infrastruktur.

## Kundenbenutzer verwalten

In **Kunden** (`/tenants`) und **Plattformverwaltung** führt die Aktion
**Benutzer verwalten** zum ausgewählten Kunden (`/users?tenantId=…`).
SUPER_ADMIN muss einen Kunden explizit auswählen; TENANT_ADMIN verwaltet über
**Benutzer** ausschließlich den eigenen Mandanten. MANAGER und USER haben keinen Zugriff.
**Benutzer anlegen** öffnet das Formular für Name, E-Mail, Kundenrolle, Passwort
(14–128 Zeichen) und Zugang (standardmäßig aktiv). Beim Bearbeiten bedeutet ein
leeres Passwort „beibehalten“. Der letzte aktive Kundenadministrator bleibt geschützt.
USER benötigen anschließend eine Liegenschaftsfreigabe auf derselben Seite.
Die Benutzerliste enthält alle Benutzer des Kunden und zeigt 20 pro Tabellenseite;
Suche und Sortierung erfolgen im Browser. Für sehr große Benutzerbestände ist
serverseitige Paginierung noch offen. Es sind keine neuen Migrationen erforderlich.

Isolierter Release-Gate nach `pnpm build`: `node tests/user-management-release.mjs`.
Er erstellt eine neue lokale PostgreSQL-Instanz auf Port 55451, wendet die 47
bestehenden Migrationen an und verwendet ausschließlich synthetische Seed-Daten
mit zufällig erzeugten Testzugängen. Anschließend laufen die vier Integrationstestsuiten
und der Playwright-Benutzerverwaltungsablauf auf Port 3107. Beide Prozesse werden
danach beendet; vorhandene Demo-Datenbanken bleiben unverändert. PostgreSQL-Testdateien
verbleiben zur Diagnose unter `.local/user-release-*` (nicht versioniert).

## Voraussetzungen

- Node.js 22.12 oder neuer
- pnpm 12.5.1 (Corepack kann die Version aus package.json verwenden)
- Git
- PostgreSQL lokal oder Docker Desktop / Docker Compose
- MQTT nur für Gateway-/MQTT-Tests; der einfache Webstart benötigt es nicht

## Lokal starten

In PowerShell oder CMD im Repository:

    corepack enable
    pnpm install --frozen-lockfile
    Copy-Item .env.example .env

In CMD entspricht der Dateikopiervorgang copy .env.example .env. Prüfe die vorhandene Datei und setze in einer nicht versionierten lokalen .env mindestens eine passende lokale DATABASE_URL, APP_URL=http://localhost:3000 und ein eigenes SESSION_SECRET. Vorhandene .env-Dateien nicht überschreiben. Für einen ausdrücklich gewünschten Seed folgen die Guards in [DEVELOPMENT.md](docs/DEVELOPMENT.md); kein automatisches Überschreiben bestehender Passwörter oder Daten.

Starte entweder pnpm db:local oder eine lokale Compose-Datenbank, nicht beides auf Port 5432:

    pnpm db:local

In einem zweiten Terminal:

    pnpm db:generate
    pnpm db:migrate
    pnpm dev

Web: http://localhost:3000. Health: /api/health/live und /api/health/ready. Der Readiness-Endpunkt bestätigt Datenbank und erforderliche Konfiguration, nicht alle externen Dienste.

## Tests und wichtige Befehle

    pnpm typecheck
    pnpm lint
    pnpm format:check
    pnpm test
    pnpm test:integration
    pnpm build
    pnpm acceptance:software
    pnpm docs:check
    pnpm docs:validate

Die Voraussetzungen einzelner Integration-, Browser-, Security-, DR- und Hardware-Simulationstests stehen in [TESTING.md](docs/TESTING.md). Für Demo-Umgebungen gibt es pnpm demo:seed, pnpm demo:reset, pnpm demo:verify und pnpm demo:verify-all; alle besitzen Environment-Schutz und benötigen passende Testdatenbank-Konfiguration.

## Staging, Demo und Hardwarestatus

Staging und Demo müssen Datenbank, MQTT, Storage, Mail, API-Schlüssel, Webhooks und Backup-Ziele strikt von Production trennen. Externes IONOS-Staging für `staging.fesch-elektrotechnik.de` verwendet gemeinsam `compose.staging.yaml` und `compose.staging.external.yaml`: Loopback-Web, privates MQTT/mTLS, externe Secrets und einen separaten Migration-Runner. Vorlagen liegen unter `infra/staging/`; `node scripts/verify-staging-config.mjs /absoluter/externer/pfad/staging.env --images` prüft die Konfiguration und die zuvor gepullten Image-Digests. Migrationen werden ausschließlich manuell im Profil `operations` ausgeführt. Neue Images müssen aus derselben freigegebenen Revision gebaut werden; Staging ist noch nicht end-to-end validiert. Startfolge, Zertifikate, Backups und verbleibende Betriebsfreigaben stehen in [STAGING.md](docs/STAGING.md) und [Known Limitations](docs/KNOWN-LIMITATIONS.md). Kein Deployment wird automatisch ausgelöst.

Softwareseitige Treiber, Simulatoren und Protokollverträge sind nicht gleich realer Hardwarevalidierung. Physische Modbus/RS485-, M-Bus-, W-MBus-, Pulse-, LoRaWAN- und Hersteller-API-Prüfungen stehen noch aus. Keine reale Hardware wird durch diesen lokalen Start verbunden.

## Dokumentation

- [Dokumentationsübersicht](docs/README.md)
- [Entwicklung](docs/DEVELOPMENT.md) · [Architektur](docs/ARCHITECTURE.md) · [Umgebungsvariablen](docs/ENVIRONMENT.md)
- [Deployment](docs/DEPLOYMENT.md) · [Operations](docs/OPERATIONS.md) · [Monitoring](docs/MONITORING.md)
- [Testing](docs/TESTING.md) · [Security](docs/SECURITY.md) · [Disaster Recovery](docs/DISASTER-RECOVERY.md)
- [Staging und Demo](docs/STAGING-DEMO.md) · [Capabilities](docs/CAPABILITIES.md) · [Known Limitations](docs/KNOWN-LIMITATIONS.md)
- [Software Acceptance](docs/SOFTWARE-ACCEPTANCE.md) · [RC Checklist](docs/checklists/RC-ACCEPTANCE-CHECKLIST.md) · [Acceptance Report](docs/acceptance/SOFTWARE-ACCEPTANCE-RESULT.md)

Der aktuelle Code- und Validierungsstatus ist in Dokumentation und CI-Workflow maßgeblich; nicht ausgeführte Provider-, Staging- oder Hardwaretests werden nicht als bestanden dargestellt.

Phase 5v verwendet isolierte lokale Acceptance-Datenbanken und Testbroker. Einstieg für den ursprünglichen Cluster: `node scripts/acceptance-local.mjs db`; Voraussetzungen stehen in [Software Acceptance](docs/SOFTWARE-ACCEPTANCE.md). Die Linux-Container-Abnahme und die Bereinigung des Worker-Images sind lokal bestanden: Runtime und SIGTERM jeweils 3/3, Image-SBOM und Secret-Scan zugeordnet. Das vorhandene Image startet `node --conditions=react-server dist/rules-worker.js`; MQTT und Rollout verwenden entsprechend ihre Bundles, Rollout zusätzlich `RUN_WORKER=true`. Datenbank, Broker und Secrets werden zur Laufzeit konfiguriert. Signing, CI auf finaler Revision und Staging bleiben ausstehend. Keine RC-Freigabe; siehe [Worker-Image-Nachlauf](docs/acceptance/WORKER-IMAGE-5EAE186.md).

Vor `pnpm db:migrate` den [unterstützten Baseline-Umfang](docs/MIGRATION-BASELINE.md) prüfen. Das Kommando führt einen lesenden Checksum-Preflight aus und bricht bei unbekannter Historie ab. Für isolierte DEMO/TEST-Umgebungen wählt SUPER_ADMIN unter `/platform-admin/demo` ausdrücklich einen synthetischen Demo-Mandanten; Apply, Refresh und NORMAL-Reset betreffen die Szenariofixtures. Kein Reset einer Bestandsdatenbank.

Der erste Administrator einer leeren externen Staging-Installation wird ausschließlich manuell mit `pnpm staging:create-admin` im Migrationsimage angelegt. Voraussetzungen, verdeckte stdin-Eingabe und absichtliche Sperre nach dem ersten Benutzer: [Staging-Operatoranleitung](docs/STAGING.md#einmaliger-erster-plattformadministrator). Kein Demo-Seed für Staging.

## Gateway-/Device-Sicherheitskorrekturen (Phase 1A)

Compliance und Gateway-Health verwenden dieselben PropertyGrants wie die
Geräteliste. Bei gemeinsam genutzten Gateways beziehen sich Geräteanzahl und
Command-Fehler und gerätebezogene Wartungsfenster nur auf freigegebene Geräte; Gateway-Betriebsdaten bleiben
gatewaybezogen. Administratoren und MANAGER behalten ihre bestehenden Leserechte.

DECOMMISSIONED ist terminal: Die Transaktion deaktiviert das Device, widerruft
aktive Device-Tokens, deaktiviert Modbus-Polling und storniert offene
PENDING-Modbus-Aufträge mit Audit. Die Ingestion lehnt stillgelegte Geräte ab.
Ein offline laufender Edge-Agent kann bereits autorisiertes Polling bis zum
nächsten Konfigurationskontakt fortsetzen; diese Daten werden nicht angenommen.
Gateway-Credentials und Broker-Identitäten werden dadurch nicht verändert.

Modbus START erfordert den abgeschlossenen ACTIVE-Inbetriebnahmestand,
completedAt, die Bestätigung der aktuellen Revision und der aktuellen Einheit
sowie ein verifiziertes Profil. Allgemeine Fleet-Commands, Rollout-Abschluss,
OTA und automatische Hardwareidentitäten bleiben Folgephasen.

Gezielte Prüfung: pnpm exec vitest run tests/gateway-device-security-db.test.ts.
Sie erstellt eine frische PostgreSQL-Testinstanz auf Loopback-Port 55453 mit
synthetischen Daten und den versionierten Migrationen, ohne bestehende Datenbanken oder .env zu
verwenden. Lizenzprüfungen und der Session-Actor werden im Service-Test injiziert;
es ist kein HTTP-/Hardwaretest. Testdateien bleiben unter .local zur Diagnose.

## Gateway-Provisioning-Grundlage (Phase 1C-A)

Gateways besitzen einen eigenen Lifecycle und eine zunächst optionale direkte
Liegenschaft. ONLINE/OFFLINE bleiben technische Kommunikationszustände. Die
Erweiterungsmigration `202610190001_gateway_provisioning_foundation` erhält alle
Bestandsdaten: keine automatische Property-Auswahl und keine ACTIVE-Freigabe.
Vorhandene `installedAt`-Werte sind unbestätigte Altmetadaten; neue Vorbereitungen
setzen kein Installationsdatum. Der Lifecycle-Service blockiert jede neue
Aktivierung bis zur vollständigen Abschlussprüfung in Phase 1C-B.

Gatewayanlage, Property-Zuordnung und Gateway-Identitätsmutationen sind jetzt
SUPER_ADMIN-only. Der bisherige Anlagevertrag darf noch einen NEW-Datensatz ohne
Property vorbereiten; Provisioning und neue Device-Zuordnungen benötigen eine
direkte Liegenschaft. Unveränderte Legacy-Zuordnungen bleiben nutzbar. Device-
Verwaltung für Kundenadministratoren bleibt innerhalb dieser Grenzen möglich.
Gateway-Imports und Device-Imports mit Gateway-Zuordnung werden bei Bestätigung
vollständig blockiert. Hierarchieverschiebungen mit Gateway-Geräten sind bis zu
einem eigenen Umzugsworkflow gesperrt. Es erfolgt keine automatische Umhängung.

DECOMMISSIONED sperrt die Gateway-Ingestion, widerruft Signaturcredentials,
storniert offene Commands und deaktiviert serverseitig Modbus-Polling atomar mit
Audit. Devices bleiben eigenständig. Kommunikationsidentitäten enthalten nur
öffentliche Inventarmetadaten; ein Widerruf wird als extern erforderlich erfasst.
**Keine automatische MQTT-/PKI-/CRL-/Broker-Sperrung und kein garantierter
Fernstopp eines offline laufenden Edge-Agenten.** Die bestehende Phase-1B-UI wird
erst in 1C-B an die neuen Serverfunktionen angebunden.

Gezielte Prüfung:
`pnpm exec vitest run tests/gateway-provisioning-db.test.ts tests/gateway-device-security-db.test.ts tests/gateway-admin-ui.test.ts`.
Der neue DB-Test verwendet einen frischen Loopback-Cluster auf Port 55454 mit
getrennten Fresh-/Upgrade-Datenbanken. Er migriert zunächst das Phase-1B-Schema,
legt mehrdeutige Legacy-Daten an und prüft deren unveränderten Erhalt beim Upgrade.
Keine vorhandene Datenbank, Hardware, Zertifikate oder MQTT-Verbindungen nötig.
