# Changelog

## Unreleased

### Added

- Persistierte synthetische Demo-Szenarien mit Tenantbindung, Apply/Refresh/Reset und lokalem Testadapter; DB-/HTTP- und Browser-Abnahmen dokumentiert.
- Lesender Migrationsbaseline-Preflight, transitive Lockfile-SBOM und lokale Web-/Worker-Pakete mit Prüfsummenprüfung; weiterhin keine RC-Freigabe.

- CI-Stufen für Fast Checks, Unit, Integration, Browser/Mobile und Produktionsbuild.
- PostgreSQL- und MQTT-Servicevorbereitung für CI.
- Prisma-Migrationsprüfung und sichere Build-Metadaten.

### Changed

- Release- und Quality-Gate-Dokumentation ergänzt.
- Betriebs-, Datenbank-, MQTT-, Worker-, Deployment-, Upgrade-, Rollback- und Capability-Dokumentation mit dem aktuellen Repository-Stand abgeglichen.

### Fixed

- Release-Workflow übergibt denselben Versionswert an SBOM und Artefaktpaket.

- Staging/Demo werden von der Laufzeit-Securitykonfiguration akzeptiert; MQTT-Transportanforderungen unterscheiden nun explizite Environments von einem allgemeinen Node-Production-Build.
- Staging Compose verwendet die implementierten Worker-Entrypoints, Broker-/Storage-Variablen und getrennte Receipt-Key-Konfiguration.

### Security

- Analytics-, Forecast- und Insight-Lesewege berücksichtigen USER-PropertyGrants in der vorhandenen Phase-5v-Fortsetzung.

- CI verwendet keine Produktionsdaten und lädt keine `.env`-Dateien als Artefakte hoch.
