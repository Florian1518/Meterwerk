# Meterwerk

## Phase 2: Release Supply Chain

Der manuelle Releaseworkflow verwendet einen gemeinsamen Build-/Publishpfad mit
Digest-Manifest, verpflichtenden Image-SBOM-/CVE-/Malware-Gates und GitHub
OIDC-Attestations. Die spätere Promotion prüft `scripts/verify-promotion.mjs`
gegen einen explizit akzeptierten SHA und erzeugt ausschließlich Digest-Referenzen.
Startschritte, Policy und noch offene Remote-Abnahme:
[Supply Chain Phase 2](docs/SUPPLY-CHAIN-PHASE-2.md).
Kein Production-Deployment; der Schedule wird erst auf dem Defaultbranch aktiv.

## Release Candidate 1.0.0-rc.7

RC7 basiert auf der tatsächlichen RC5/Staging-Linie mit 49 historischen Migrationen und ergänzt ausschließlich SaaS Pricing als Migration 50. RC6 bleibt wegen seiner divergierenden Migrationslinie historisch und wird nicht bereitgestellt. Git-Herkunft, Prüfablauf und lokale Abnahme: [RC7-Release-Nachweis](docs/RELEASE-RC7.md).

Der reproduzierbare Upgrade-Test benötigt eine neue, leere lokale Acceptance-Datenbank: zunächst `node scripts/acceptance-local.mjs db`, dann `node scripts/acceptance-local.mjs upgrade rc7-upgrade scripts/acceptance-rc7-lineage.mjs`. Er setzt keine vorhandene Datenbank zurück. Die zusätzlich aktivierte Gateway-Browser-Suite benötigt nach dem synthetischen Seed einmalig `node scripts/acceptance-local.mjs test gateway-browser-fixture node_modules/tsx/dist/cli.mjs tests/helpers/gateway-browser-fixtures.ts`; anschließend `GATEWAY_PROVISIONING_E2E=true` in der Browser-Testumgebung setzen. User-Management verwendet weiterhin seinen eigenen isolierten Release-Runner.

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
Er erstellt eine neue lokale PostgreSQL-Instanz auf Port 55451, wendet die 48
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
setzen kein Installationsdatum. Phase 1C-B ergänzt die nachweisgebundene Aktivierung; der manuelle Ablauf ist unten beschrieben.

Gatewayanlage, Property-Zuordnung und Gateway-Identitätsmutationen sind jetzt
SUPER_ADMIN-only. Seit Phase 1C-B benötigt jeder neue NEW-Datensatz eine direkte Property; Provisioning und neue Device-Zuordnungen benötigen eine
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
Fernstopp eines offline laufenden Edge-Agenten.** Die SUPER_ADMIN-Oberfläche verwendet seit Phase 1C-B die direkten Property- und Lifecycle-Daten.

Gezielte Prüfung:
`pnpm exec vitest run tests/gateway-provisioning-db.test.ts tests/gateway-device-security-db.test.ts tests/gateway-admin-ui.test.ts`.
Der neue DB-Test verwendet einen frischen Loopback-Cluster auf Port 55454 mit
getrennten Fresh-/Upgrade-Datenbanken. Er migriert zunächst das Phase-1B-Schema,
legt mehrdeutige Legacy-Daten an und prüft deren unveränderten Erhalt beim Upgrade.
Keine vorhandene Datenbank, Hardware, Zertifikate oder MQTT-Verbindungen nötig.

## Manueller Gateway-Provisioningprozess (Phase 1C-B)

Unter „Gateways & Geräte“ wählt SUPER_ADMIN Kunde und dessen Liegenschaft,
Name, externe Gateway-ID, Hersteller und Modell. Neue Gateways sind NEW;
installedAt bleibt leer. Legacy-NULL wird als „Keine Liegenschaft zugeordnet“
angezeigt und nicht aus Devices abgeleitet. ONLINE/OFFLINE bleibt unabhängig
vom administrativen Lifecycle; ein Heartbeat aktiviert kein Gateway.

1. Provisionierung ausdrücklich starten (NEW/FAILED/MAINTENANCE → PROVISIONING).
2. Das Gateway erzeugt später seinen Ed25519 Private Key lokal. In Meterwerk
   ausschließlich den Public Key als SPKI-PEM registrieren. Die Antwort enthält
   Credential-ID und SHA-256-Fingerprint, keinen privaten Schlüssel.
3. Öffentliche MQTT-Zertifikatsmetadaten registrieren (CN = interne Gateway-ID).
   PKI und Brokerfreischaltung erfolgen extern/manuell. Erst danach deren
   tatsächliche Ausführung ausdrücklich in Meterwerk bestätigen.
4. Akzeptierten signierten Heartbeat empfangen und Installation vor Ort
   ausdrücklich bestätigen. Die Installation erhält Serverzeit und Audit;
   historische Installationsdaten allein reichen nicht aus.
5. Devices zuordnen und bestehende Geräte-/Modbus-Inbetriebnahme abschließen.
6. Die konkreten Schritte und Blocker prüfen und „Gateway aktivieren“ bestätigen.
   Der Server prüft alle Nachweise erneut in der Aktivierungstransaktion.

Readiness verlangt direkte Property, konsistente Stammdaten, PROVISIONING,
gültiges aktives Ed25519-Credential, gültige und extern freigeschaltete
Kommunikationsidentität, keinen unbestätigten Widerruf, bestätigte Installation,
geeignete Devices derselben Property und abgeschlossene Inbetriebnahme.
Modbus verlangt gültige Konfiguration, verifiziertes Katalogprofil, Messungsreview
der aktuellen Revision, bestätigte Nutzungseinheit, ACTIVE/completedAt und keine
ungeklärten Inbetriebnahmeaufträge der aktuellen Revision. Ein erfolgreicher
Einzelcommand genügt nicht. Andere Protokolle benötigen Device-Lifecycle ACTIVE.

firstContactAt bleibt historisch. Ein neuer Versuch benötigt zusätzlich ein
atomar geschriebenes Heartbeat-Auditereignis mit Serverzeit nach
provisioningStartedAt. lastSeenAt bleibt die akzeptierte Heartbeat-Zeit des
Geräts; sie wird nicht als alleiniger Server-Empfangsnachweis verwendet.
Aus MAINTENANCE ist deshalb keine direkte Aktivierung mehr vorgesehen.

Propertywechsel erfolgen nur im selben Tenant, in NEW/MAINTENANCE und ohne
Devices oder offene Commands. Das gilt auch für bisherige Legacy-NULL-Gateways.
Ein Wechsel entwertet Installation und Aktivierung; Messhistorie wird nicht
verschoben. Eine einfache Umhängung belegter Gateways wird abgelehnt.

Stilllegung ist terminal und sperrt die Anwendung, widerruft Signaturcredentials,
storniert offene Commands und deaktiviert serverseitiges Modbus-Polling. Devices
bleiben eigenständig. Externe Brokerwiderrufe müssen separat ausgeführt und
bestätigt werden; ohne diesen Nachweis besteht keine Aussage vollständiger Sperrung.

Die bisherigen HTTP-CREATE-/ROTATE-Aktionen für Gateway-Credentials sind
deaktiviert. Die Credential-Endpunkte erlauben nur noch Widerruf; neue
Signaturidentitäten werden über den Public-Key-Provisioningpfad registriert.
Private Keys werden weder durch die Plattform-API noch im Admin-Browser erzeugt.
Der lokale Demo-Seed `seed-edge.ts` ist separat auf `SEED_DEMO=true`, Nicht-
Produktion und Loopback-Datenbank beschränkt. Keine Hardware, MQTT-Verbindung,
Zertifikatsausstellung oder Broker-ACL-Änderung wird ausgelöst.

## Technisch bestätigte Modbus-Inbetriebnahme

Der 9-Schritte-Assistent gibt Messwertprüfung, Nutzungseinheitsbestätigung und Abschluss erst nach serverseitiger Verifikation frei. Ein angelegter oder abgelaufener Gateway-Auftrag ist kein Erfolg. TEST-Ergebnis, validierte Messdaten und Bestätigungen müssen zur aktuellen Konfigurationsrevision gehören; jede Speicherung der Konfiguration startet die Verifikation erneut. Für Messwertprüfung und Abschluss gilt weiterhin das Fünf-Minuten-Fenster der Diagnose. Das Dreiphasen-Simulatorprofil ist ausschließlich ein Software-/Workflow-Test.

Vor dem Webstart `pnpm db:migrate` mit erfolgreichem Baseline-Check ausführen. Die Migration `202610220001_modbus_commissioning_evidence` ergänzt Bestätigungszeitpunkte/Benutzer und repariert ausschließlich bereits abgeschlossene `TEST-EL-001`-Datensätze ohne technische Nachweise. Gültige Inbetriebnahmen bleiben gespeichert. In den hier geprüften lokalen Entwicklungs- und Acceptance-Datenbanken war dieser Zähler nicht vorhanden; ein externes Ziel wurde nicht verändert. Die lokale Entwicklungsdatenbank hatte eine abweichende Prüfsumme für `202609240008_dashboards`; ohne unterstützten Migrationspfad dort kein Upgrade erzwingen.

Zusätzliche Prüfungen: `pnpm exec vitest run tests/modbus-commissioning.test.ts`. Der PostgreSQL-Test läuft ausschließlich auf der isolierten Acceptance-Datenbank: nach deren Start und Migration `node scripts/acceptance-local.mjs test commissioning-db node_modules/vitest/vitest.mjs run --config vitest.commissioning.config.ts` (entspricht `pnpm test:commissioning:integration` mit der Acceptance-Umgebung). Er verwendet synthetische Daten und bereinigt seinen eigenen Testmandanten.

## Automatische SaaS-Preise

Unter Vertragsverwaltung kann SUPER_ADMIN zwischen Festpreis (`FIXED`) und Grundpreis plus abrechenbaren Messpunkten (`BASE_PLUS_METER`) wählen. Alle Beträge gelten für das ausgewählte Monats- oder Jahresintervall; es gibt keine automatische Umrechnung. Die Übersicht zeigt nach dem Speichern den serverseitig berechneten Gesamtpreis. `/billing` ist für TENANT_ADMIN ausschließlich lesbar und enthält keine externe Billing-ID. Energie- und Verbrauchstarife bleiben getrennt; diese Berechnung löst keine Rechnung oder Zahlung aus.

Die additive Migration `202610260001_saas_pricing` erhält bestehende Subscriptions als `FIXED`, einschließlich noch nicht festgelegter Preise. Meter werden standardmäßig abrechenbar; historische Altzähler aus `MeterReplacement` werden davon ausgenommen, auch innerhalb einer Wechselkette. Messwerte bleiben unverändert. Beim erfolgreichen Zählerwechsel wird der alte Zähler nicht abrechenbar und der neue abrechenbar, atomar mit Wechsel und Audit. `OFFLINE` und `MAINTENANCE` beeinflussen die Abrechenbarkeit nicht. Der aktuelle Bestand wird gezählt, ohne historische Stichtagsabrechnung oder zeitanteilige Berechnung.

Für lokale Entwicklung: Datenbank mit `pnpm db:local` starten, Migrationen nach dem Baseline-Check mit `pnpm db:migrate` anwenden und `pnpm db:generate` ausführen. Tests: `pnpm test:licensing` (nur lokale Demo-Datenbank mit `SEED_DEMO=true`) und `pnpm exec vitest run tests/saas-pricing.test.ts tests/billing-provider.test.ts`. Die neuen Integrationstests erzeugen und entfernen eigene Preis-/Zählerfixtures und prüfen die Migration in einem zurückgerollten Testschema.
