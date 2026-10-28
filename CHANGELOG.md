# Changelog

## 1.0.0-rc.7

- Basiert direkt auf der realen RC5/Staging-Linie `305580eb2f214bd867030545f0180bc8dbcb224f` mit 49 historischen Migrationen.
- Gateway-Provisioning (`202610190001_gateway_provisioning_foundation`) und Modbus-Commissioning-Evidence (`202610220001_modbus_commissioning_evidence`) bleiben unver?ndert erhalten.
- SaaS Pricing (`202610260001_saas_pricing`) erg?nzt die Historie additiv auf 50 Migrationen.
- Allgemeine RC6-Security- und Release-H?rtungen ?bernommen; keine Bereitstellung durch diese Vorbereitung.

## 1.0.0-rc.6 (historisch, nicht deployed)

- SHA: `331009a92fa06173133d8db28273355c648a7889`.
- Lokal bestanden, aber wegen divergierender Staging-Migrationshistorie nicht deploybar. RC6 bleibt unver?ndert.

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
