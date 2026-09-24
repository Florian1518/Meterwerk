# Release Checklist

## Vor Release

- [ ] SemVer-Version gesetzt und `CHANGELOG.md` aktualisiert
- [ ] CI vollständig grün: Typecheck, Lint, Format, Unit, Integration, Build
- [ ] Migration Check auf frischer PostgreSQL-Datenbank grün
- [ ] Dependency Audit und Secret Scan grün
- [ ] CycloneDX-SBOM erzeugt
- [ ] Image-Name, Version, Git-SHA und Digest dokumentiert
- [ ] Backup/PITR-Bereitschaft geprüft

## Staging

- [ ] Getrennte Secrets und Datenbank verwendet
- [ ] Web, PostgreSQL und MQTT healthy
- [ ] Rules-/Rollout-Worker Heartbeats vorhanden
- [ ] Login, Dashboard, API und simulierte Ingestion geprüft
- [ ] Reports, Queues und Incidents geprüft
- [ ] `scripts/smoke-staging.mjs` und `scripts/release-gate.mjs` erfolgreich

## Release

- [ ] RC-Tag erstellt, z. B. `v1.0.0-rc.1`
- [ ] Artefakte und SBOM archiviert
- [ ] Container-Digest unveränderlich referenziert
- [ ] Manuelle Freigabe erteilt
- [ ] Finaler Tag erstellt, z. B. `v1.0.0`

## Nach Release

- [ ] Web-/DB-/MQTT-Health geprüft
- [ ] Worker, Fehlerquote, Queues und Incidents überwacht
- [ ] Rollback-Artefakt und Backup erreichbar

## Schutz und Freigaben

Branch Protection, Required Reviews und Required Status Checks werden im Repository-UI aktiviert. Environments `development`, `staging` und `production` werden getrennt angelegt; `production` benötigt Required Reviewers und getrennte Secrets. Ein automatischer Produktionspfad ohne Approval ist nicht vorgesehen.
