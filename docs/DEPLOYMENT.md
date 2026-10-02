# Deployment

## Externes Staging v1.0 RC

Der aktuelle verbindliche Vorbereitungsablauf steht in [STAGING.md](STAGING.md),
die Befunde in [Staging Deployment Readiness](acceptance/STAGING-DEPLOYMENT-READINESS.md).
Baseline ist `dce9b24958cee9c0ceb5ef9424767177c7dbc9bf`.
Registry, Provider, Proxy/TLS und ergänzende Staging-Infrastruktur sind noch offen.
Das Staging-Compose nicht unverändert vollständig starten. Es benötigt insbesondere
Brokerkonfiguration/mTLS, vollständige Secret-Injektion, Restart-/Shutdown-Vorgaben
und einen separaten Migration-Runner. Kein Deployment wurde ausgeführt.

Diese Anleitung beschreibt einen providerunabhängigen, kontrollierten App-Rollout. Compose-Dateien sind Referenzen, keine Behauptung eines erfolgreich validierten Produktionsstacks. Keine Produktions-Credentials in Dateien, Images oder Git speichern.

## Voraussetzungen

- Node.js 22.12+ und pnpm 12.5.1 für Build/Administration oder Docker Engine/Compose für Containerbetrieb.
- Getrennte PostgreSQL-Datenbank, MQTT-Broker, private Storage-Ressourcen und externe Secret-Verwaltung je Environment.
- Reverse Proxy mit TLS, DNS, persistente Backup-/MQTT-Volumes wo erforderlich, sowie getrennte Web- und Worker-Prozesse.
- Externe Werte anhand [ENVIRONMENT.md](ENVIRONMENT.md) bereitstellen. Produktive Werte niemals aus `.env.example` übernehmen.

## Build und Start

Release anhand eines unveränderlichen Git-SHA/Artefakts bauen: `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm build`. `compose.production.yaml` enthält App, MQTT und einen MQTT-Worker; PostgreSQL ist extern über `DATABASE_URL` bereitzustellen. Rules-/Rollout-Worker separat und nur mit tatsächlichem Entrypoint betreiben. Siehe [WORKERS.md](WORKERS.md).

Vor Rollout Version, SHA, Konfiguration und Datenbankziel prüfen. Für kritische Migrationen verifiziertes Backup sicherstellen. Migrationen mit der passenden Release-Version kontrolliert deployen (`pnpm db:migrate` oder entsprechender Prisma-Befehl im freigegebenen Image). Dann App und Worker bereitstellen. Schemaänderungen können abgestimmte Release-Schritte benötigen.

## Netzwerk und Health

Web nur über Reverse Proxy veröffentlichen; Backend-DB und MQTT nicht unnötig öffentlich öffnen. TLS am Proxy terminieren, HTTPS erzwingen und Forwarded-Header nur von vertrauenswürdigem Proxy akzeptieren. Broker-TLS/ACL und Gateway-Zertifikate nach Infrastrukturvorgaben konfigurieren. Storage-Buckets/Objekte bleiben privat.

`/api/health/live` zeigt Prozess-Liveness, `/api/health/ready` prüft Datenbank und erforderliche Produktionskonfiguration, nicht automatisch jede optionale Integration. Build-Info und Worker/Integration-Health separat kontrollieren. Danach Migrationstatus, Login, Tenant-Scope, Dashboard, Messwerte, API soweit aktiviert sowie Logs/Alerts prüfen.

## Fehler und Rollback

Deployment stoppen, Fehler sichern und vorheriges kompatibles Image nur nach Schema-/Worker-Kompatibilitätsprüfung zurückstellen. Keine automatische DB-Rückmigration. Bei Datenbeschädigung nicht normalen App-Rollback mit Restore verwechseln: ausschließlich kontrollierten DR-Prozess verwenden. Details in [Upgrade](UPGRADE.md), [Rollback](ROLLBACK.md) und [Disaster Recovery](DISASTER-RECOVERY.md).

## Reifegrad

CI-Build und Release-Artefakt sind vorhanden. Release Workflow führt kein automatisches Staging-/Production-Deployment und keinen Registry-Push aus. Separate Worker-Entrypoints und lokales Attachment-Volume sind im Staging-Compose vorhanden; der externe Gesamtstack ist nicht validiert. Die offenen Infrastrukturvoraussetzungen aus [Staging Readiness](STAGING.md) zuerst erfüllen. Keine reale Hardware erforderlich oder hier getestet.
