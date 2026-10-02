# Staging Deployment Readiness – Meterwerk v1.0 RC

Stand: 2026-10-02. Dokumentations-/Quellcodeprüfung, kein Deploymenttest.

## Baseline und Fortsetzung

- Repository: https://github.com/Florian1518/Meterwerk.git, Branch master.
- Geprüfter HEAD / FINAL_RELEASE_METADATA_COMMIT: `dce9b24958cee9c0ceb5ef9424767177c7dbc9bf`.
- VALIDATED_CODE_SHA: `0186e076331f34dd10aefd6192c11417f25e2c04`.
- Ursprünglicher und bei Fortsetzung geprüfter Arbeitsbaum: clean; keine Diffs.
- Unterbrechung: erster Schreibversuch für docs/STAGING.md scheiterte an einem
  ungültigen Patch mit zwei Operationen auf dieselbe Datei. Keine Teiländerung.
- Vorher vollständig: Punkt 1 Baseline, Punkt 2 Bestandsaufnahme. Punkte 3–19
  waren untersucht/inhaltlich vorbereitet, aber noch nicht als Ergebnis gespeichert.
  Erster offener dauerhafter Ergebnisstand: Punkt 3 Zielarchitektur; Punkt 20
  Dokumentationsschreibversuch blieb erfolglos. Punkt 21 war nicht ausgeführt.
- Fortsetzung: vorhandene Befunde übernommen, Punkte 3–20 dokumentiert;
  keine wiederholte Software-Acceptance, kein Reset, kein Commit/Push/Tag.

LOCAL SOFTWARE ACCEPTANCE: PASSED; REMOTE CI: PASSED;
METERWERK V1.0 RC PREPARATION: READY – übernommener freigegebener Status.
Next.js 16.3.8, Dependency Audit 0 Advisories sowie Web-/Worker-Runtime und SBOM
PASSED gehören zum bekannten RC-Stand, wurden hier nicht erneut getestet.
Vorhandene Acceptance-Berichte wurden nicht überschrieben.

## Befunde und Einordnung

| Befund                                                                                     | Einordnung / Konsequenz                                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Web-/Worker-Dockerfiles, drei Worker, internes Staging-Netz, persistente Volumes vorhanden | Vorbereitung verwendbar, kein externer Laufzeitnachweis                           |
| MQTT-Konfigurationsmount fehlt im Staging-Compose                                          | Deploymentlücke; lokaler Broker-Healthcheck beweist keine Verbindung aus Worker   |
| Development-Broker erlaubt anonymen Zugriff                                                | Nicht übernehmen; eigene Staging-mTLS-Konfiguration aus Pilotreferenz vorbereiten |
| Proxy/TLS/DNS/Registry fehlen                                                              | Externes Deployment blockiert bis Infrastrukturentscheidung und Umsetzung         |
| Restart-/Grace-/Loglimits fehlen                                                           | Vor Start nach Runbook ergänzen                                                   |
| MFA/Webhook-Secrets und mTLS nicht vollständig im Compose injiziert                        | Explizite sichere Konfiguration nötig; keine Default-Schlüssel nutzen             |
| Host-/HTTPS-/HSTS-Prüfung teilweise nur bei production                                     | Im staging-Proxy erzwingen; Secrets separat preflight-prüfen                      |
| NEXT_PUBLIC-Label nur als Runtime-Variable gesetzt                                         | Buildkonfiguration vor Promotion ergänzen, UI-Label prüfen                        |
| 47 Migrationen und Baselineprüfung vorhanden                                               | Eigener kurzlebiger administrativer Runner vor App-/Workerstart                   |
| Demo-Seed sperrt staging, wiederholter Seed verändert Fachdaten                            | Kein direkter Staging-Seed; geprüfte lokale synthetische Fixtures verwenden       |
| Backup-Helfer hat lokale DB-/Compose-Annahmen                                              | Staging-spezifische Operatorbefehle dokumentiert; Restore offen                   |
| SMTP/API-Adapter liefert accepted:false                                                    | Externer Mailversand nicht bereit; für diesen Scope local verwenden               |
| Smoke-Script prüft nur drei öffentliche Basisendpunkte und hat localhost-Fallback          | Explizites Ziel und erweiterten manuellen fachlichen Checkplan verwenden          |

**Neu nachgewiesener RC-Software-Blocker: NEIN.** Es wurden Konfigurations- und
Deploymentlücken sowie Funktionsgrenzen gefunden, kein neuer funktionaler
RC-Codefehler durch Laufzeittest nachgewiesen. Externes Deployment ist trotzdem
noch nicht freigegeben. Keine funktionalen Codeänderungen vorgenommen.

## Vorbereitete Ergebnisse

[STAGING.md](../STAGING.md) enthält Zielarchitektur, vollständiges abgegrenztes
Variableninventar mit REQUIRED/OPTIONAL/EXTERNAL_PROVIDER_REQUIRED, Digeststrategie,
Migration/Fixtures, Health/Shutdown/Restart, TLS/Security, Backup/Monitoring,
17-stufiges Runbook, ausführbaren Operator-Smokeplan und getrennten APP_ROLLBACK /
DATABASE_ROLLBACK. [DEPLOYMENT.md](../DEPLOYMENT.md) und
[OPERATIONS.md](../OPERATIONS.md) verweisen auf diesen Stand.

Mindestplanung: 2 vCPU, 8 GiB RAM, 80 GiB SSD und separates Backupziel zunächst
40 GiB, Builds außerhalb der VM. Keine Production- oder Lastkapazitätszusage.
Web-Grace mindestens 30s gegenüber ca. 11,90s bisherigem Drain; Worker/DB 60s,
MQTT/Proxy 30s als zu messende Startwerte.

Die noch zu erstellende Infrastruktur-Ergänzung ist bewusst kein vorhandenes
oder validiertes Artefakt. Die Vorbereitung hier umfasst Dokumentation; ihre
Umsetzung und Laufzeitvalidierung bleiben vor echtem Deployment erforderlich.

## Offene Nachweise

- STAGING_DEPLOYMENT_PENDING: JA.
- PITR_FULL_RESTORE_PENDING: JA.
- HA_FAILOVER_PENDING: JA.
- REPRESENTATIVE_LOAD_PENDING: JA.
- HARDWARE_VALIDATION_PENDING: JA; Hardware ausdrücklich außerhalb dieses Auftrags.
- Externe Ressourcen tatsächlich angelegt: NEIN.
- Registry/Credentials/GitHub Environment erstellt: NEIN.
- Deployment/Production-Zugriff/reale Nachrichten: NEIN.

Provider muss Linux amd64, Containerplattform, Web plus drei Worker, PostgreSQL,
MQTT, Persistenz, private Netze, HTTPS/DNS/TLS, Secretverwaltung, Restartkontrolle,
Backup/Restore, Monitoring, Registryzugriff und Administration ermöglichen.
Noch kein Anbieter ausgewählt oder diese Funktionen bei einem Anbieter bestätigt.

Benötigt: Providerpräferenz oder keine Präferenz; Staging-Domain und Domainbesitz;
Monatsbudget einschließlich Backups/Registry; Deutschland-/EU-Pflicht;
vorhandene Server/Registry; DNS-/Administrationszuständigkeit und Testzugang.
Keine Secretwerte im Chat oder Repository anfordern.

## Validierung

Dokumentationsprüfungen erfolgreich ausgeführt: Prettier, docs:check
(101 Markdown-Dateien), docs:validate (13 erforderliche Anleitungen),
security:secrets (0 Findings) und git diff --check. Der Secret-Scan umfasst
versionierte und nicht ignorierte Arbeitsdateien, nicht die Git-Historie.
pnpm war in dieser Shell nicht im PATH; dieselben installierten Prettier- und
Projektprüfskripte wurden direkt mit Node ausgeführt. Keine Installation nötig.
Git meldet lediglich die bestehende LF/CRLF-Konvertierung, keine Diff-Fehler.
Keine vollständige Testsuite oder Remote-CI erneut ausgeführt.
