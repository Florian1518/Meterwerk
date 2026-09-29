# Meterwerk

Meterwerk ist eine mandantenfähige Webanwendung zur Verwaltung und Auswertung von Zählern für Strom, Wasser, Gas und Wärme. Sie umfasst Benutzer- und Tenantverwaltung, Messwerte, Dashboards und Analytics, Regeln/Alarme, Reports, Geräte/Gateways, WorkOrders, Support, Public API, Webhooks und Operations.

Die Anwendung basiert auf Next.js App Router, TypeScript, PostgreSQL und Prisma. Ein MQTT-Ingestion-Prozess und ein optionales Edge Gateway ergänzen den Webprozess. Die fachliche Wahrheit liegt in PostgreSQL; produktive Integrationen benötigen getrennte, sicher konfigurierte Infrastruktur.

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

Staging und Demo müssen Datenbank, MQTT, Storage, Mail, API-Schlüssel, Webhooks und Backup-Ziele strikt von Production trennen. Die vorhandene Staging-Compose-Konfiguration ist noch nicht vollständig end-to-end validiert; vor Nutzung siehe [STAGING.md](docs/STAGING.md) und [Known Limitations](docs/KNOWN-LIMITATIONS.md). Kein Produktionsrelease wird automatisch ausgelöst.

Softwareseitige Treiber, Simulatoren und Protokollverträge sind nicht gleich realer Hardwarevalidierung. Physische Modbus/RS485-, M-Bus-, W-MBus-, Pulse-, LoRaWAN- und Hersteller-API-Prüfungen stehen noch aus. Keine reale Hardware wird durch diesen lokalen Start verbunden.

## Dokumentation

- [Dokumentationsübersicht](docs/README.md)
- [Entwicklung](docs/DEVELOPMENT.md) · [Architektur](docs/ARCHITECTURE.md) · [Umgebungsvariablen](docs/ENVIRONMENT.md)
- [Deployment](docs/DEPLOYMENT.md) · [Operations](docs/OPERATIONS.md) · [Monitoring](docs/MONITORING.md)
- [Testing](docs/TESTING.md) · [Security](docs/SECURITY.md) · [Disaster Recovery](docs/DISASTER-RECOVERY.md)
- [Staging und Demo](docs/STAGING-DEMO.md) · [Capabilities](docs/CAPABILITIES.md) · [Known Limitations](docs/KNOWN-LIMITATIONS.md)
- [Software Acceptance](docs/SOFTWARE-ACCEPTANCE.md) · [RC Checklist](docs/checklists/RC-ACCEPTANCE-CHECKLIST.md) · [Acceptance Report](docs/acceptance/SOFTWARE-ACCEPTANCE-RESULT.md)

Der aktuelle Code- und Validierungsstatus ist in Dokumentation und CI-Workflow maßgeblich; nicht ausgeführte Provider-, Staging- oder Hardwaretests werden nicht als bestanden dargestellt.

Phase 5v verwendet einen separaten lokalen Acceptance-Cluster auf Port 55435 und eine Web-Testinstanz auf Port 3105. Einstieg: `node scripts/acceptance-local.mjs db`; weitere Voraussetzungen stehen in [Software Acceptance](docs/SOFTWARE-ACCEPTANCE.md). Argon2, Login und Production Build sind inzwischen lokal bestanden. Die Fortsetzung auf `e88b1de` ist weiterhin keine RC-Freigabe; siehe [Fortsetzungsbericht](docs/acceptance/PHASE-5V-RESUME.md).

Vor `pnpm db:migrate` den [unterstützten Baseline-Umfang](docs/MIGRATION-BASELINE.md) prüfen. Das Kommando führt einen lesenden Checksum-Preflight aus und bricht bei unbekannter Historie ab. Für isolierte DEMO/TEST-Umgebungen wählt SUPER_ADMIN unter `/platform-admin/demo` ausdrücklich einen synthetischen Demo-Mandanten; Apply, Refresh und NORMAL-Reset betreffen die Szenariofixtures. Kein Reset einer Bestandsdatenbank.
