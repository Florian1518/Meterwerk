# Changelog

## Unreleased

### Added

- CI-Stufen für Fast Checks, Unit, Integration, Browser/Mobile und Produktionsbuild.
- PostgreSQL- und MQTT-Servicevorbereitung für CI.
- Prisma-Migrationsprüfung und sichere Build-Metadaten.

### Changed

- Release- und Quality-Gate-Dokumentation ergänzt.
- Betriebs-, Datenbank-, MQTT-, Worker-, Deployment-, Upgrade-, Rollback- und Capability-Dokumentation mit dem aktuellen Repository-Stand abgeglichen.

### Fixed

- Staging/Demo werden von der Laufzeit-Securitykonfiguration akzeptiert; MQTT-Transportanforderungen unterscheiden nun explizite Environments von einem allgemeinen Node-Production-Build.
- Staging Compose verwendet die implementierten Worker-Entrypoints, Broker-/Storage-Variablen und getrennte Receipt-Key-Konfiguration.

### Security

- CI verwendet keine Produktionsdaten und lädt keine `.env`-Dateien als Artefakte hoch.
