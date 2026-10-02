# CI- und Staging-Bereitschaft – RC-Commit 84ce62c

Stand: 02.10.2026. Geprüfter Commit `84ce62c5c48011bb0354b556ddb77c4abc20c438`, Branch `master`. Der RC-Funktionscode blieb unverändert. Es wurden keine externen CI-Läufe, Staging-Deployments, Tags oder Pushes ausgelöst.

## Ergebnis

- `CI_REMOTE_NOT_CONFIGURED`: `git remote -v` ist leer; es wurde kein Remote angelegt.
- `CI_CONFIG_VERIFIED`: GitHub-Actions-Workflows sind statisch konfiguriert und `scripts/verify-ci-release-config.mjs` besteht.
- `CI_LOCAL_EQUIVALENT_PASSED`: Frozen Install, Generate, Typecheck, Lint, Format, Unit/Security, Build, Worker-Bundle/Statik, Doku- und Secret-Gates bestanden.
- `CI_LOCAL_EQUIVALENT_FAILED`: aktueller Registry-Audit findet eine kritische Next.js-Schwachstelle; `pnpm audit --audit-level high` endet mit Exit 1. Damit würde der Fast-Job in CI fehlschlagen. RC bleibt unverändert.
- `CI_REMOTE_RUN_PENDING`: kein Remote verfügbar und kein CI-Lauf ausgelöst.
- `STAGING_CONFIG_VERIFIED`: Compose-Konfiguration syntaktisch valide und Staging-Netz/Ressourcen sind von Production getrennt. Keine Laufzeitvalidierung.
- `STAGING_DEPLOYMENT_PENDING`: es wurde keine Staging-Infrastruktur gestartet.
- `SIGNING_PREPARED_NOT_VERIFIED`: lokale BuildKit-Provenance ist keine Signatur; weder externer Signer noch Signaturverifikation ausgeführt.
- `PROVIDER_VALIDATION_PENDING`, `PITR_FULL_RESTORE_PENDING`, `HA_FAILOVER_PENDING`, `REPRESENTATIVE_PRODUCTION_LOAD_PENDING`.

## CI-Prüfung

`ci.yml` läuft bei Push, Pull Request und `workflow_call`; `release.yml` bei manuellem `workflow_dispatch` und bei Tags `v*.*.*`. Alle Actions sind auf Commit-SHAs gepinnt. Permissions sind `contents: read`; Checkout verwendet `persist-credentials: false`. Node 22, pnpm 12.5.1, Frozen Lockfile und pnpm Cache sind gesetzt. PostgreSQL-/Mosquitto-Service-Images und `node:22-alpine` sind Versions-Tags statt Digests.

Der CI-Fast-Job enthält Prisma Generate/Validate, Typecheck, ESLint, Prettier, Dokumentationschecks, CI-Konfigurationsprüfung, Image-Policy-Tests, Diff-Check, Dependency Audit und Secret Scan. Folgejobs führen Unit/Security, PostgreSQL-Integration/Migrationen und API-Tests, Browser-E2E und Production Build aus. Der Release-Artefaktjob erzeugt und verifiziert Artefakte, baut Worker-Bundles, Web- und Worker-Images und startet Image-Smokes. Image-SBOM-Erzeugung ist optional: bei fehlendem Docker-SBOM-Befehl meldet der Workflow nur `IMAGE_SBOM_NOT_EXECUTED` und bleibt erfolgreich.

Lokale Ergebnisse:

Die lokalen Shell-Schritte liefen auf Windows mit Node `24.19.0`; GitHub Actions
installiert Node `22`. Die Docker-Images aus der RC-Abnahme wurden auf Linux/
amd64 validiert. Das ist eine lokale Gate-Simulation, kein identischer Ubuntu-
Runner-Nachweis.

| Schritt                                                     |  Exit | Ergebnis                                    |
| ----------------------------------------------------------- | ----: | ------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                   |     0 | PASS, pnpm 12.5.1                           |
| `corepack pnpm db:generate`                                 |     0 | PASS                                        |
| `corepack pnpm exec prisma validate`                        |     0 | PASS                                        |
| `corepack pnpm typecheck`                                   |     0 | PASS                                        |
| `corepack pnpm lint`                                        |     0 | PASS                                        |
| `corepack pnpm format:check`                                |     0 | PASS                                        |
| `corepack pnpm docs:check` / `docs:validate`                | 0 / 0 | PASS                                        |
| `node scripts/verify-ci-release-config.mjs`                 |     0 | PASS                                        |
| Image-/Worker-/SBOM-Policy-Regressionen                     |     0 | PASS, 16/16                                 |
| `corepack pnpm test`                                        |     0 | PASS, 285/285                               |
| `corepack pnpm security:regression`                         |     0 | PASS, 63/63                                 |
| `corepack pnpm build`                                       |     0 | PASS                                        |
| Worker-Bundle-Build + Worker Static Verification            | 0 / 0 | PASS, 3 Bundles, 4 Stufen                   |
| `corepack pnpm env:check`                                   |     0 | PASS, Environment `development`             |
| Secret Scan                                                 |     0 | PASS, 0 Review-Funde                        |
| Staging Compose `config --quiet` (synthetische Platzhalter) |     0 | PASS, rein statisch                         |
| `corepack pnpm audit --audit-level high`                    |     1 | **FAIL**, ein Critical Advisory für Next.js |

Worker-Bundles wurden nach einem zunächst durch `tsx`/Windows-`uv_os_get_passwd` gescheiterten Start direkt mit dem Build-Skript erzeugt; Build und statische Prüfung bestanden. Die vollständigen Phase-5v-Datenbank-, Browser-, Demo- und Recovery-Suiten wurden nicht erneut gestartet: gegenüber dem validierten RC-Ausgangspunkt enthält Commit 84ce62c nur Acceptance-Dokumentation. Die Ergebnisse bleiben als Evidence des Commits 1e6589e erhalten. Der Production Build wurde auf 84ce62c lokal bestanden.

Die final validierten Images bleiben dem vorherigen Code-SHA
`1e6589e2ee84eae787e444a0ab311fb1020853e6` zugeordnet: Worker
`meterwerk-worker:rc-1e6589e`, ID
`sha256:7d78101dcc9aa1ba48eea93c5136c3be5ec41add44221b2df6fad2aaa4f07d7e`;
Web `meterwerk-web:rc-1e6589e`, ID
`sha256:a7073d4964b27ada5cc9dba076a380e825533dce79bcbe88e3cbf8a23c472cbb`.
Sie werden nicht als Build des neuen Commit-SHA ausgegeben. Der Release-Workflow
würde nach grüner Quality-Stufe beide Images neu bauen. Wegen des Audit-Fehlers
wurde dieser nachgelagerte Build hier nicht gestartet.

### Sicherheits-Audit

Lockfile und installierte Next-Version: `16.3.5`. Die Registry meldet `GHSA-vcvr-r3jv-pc5j` / `CVE-2026-94545`, kritisch, betroffen `>=16.2.0 <16.3.6`. Die Next.js-Advisory beschreibt RCE in der Node-Implementierung von `next/og` `ImageResponse`, wenn nicht vertrauenswürdige Werte in SVG-Inhalt, Attribute oder Styles gelangen. In `src/` und `apps/` fand sich kein `next/og`-/`ImageResponse`-Aufruf; das schränkt die konkrete Anwendungsbedingung ein, ändert aber nicht den roten vorgeschriebenen CI-Audit. Das Next.js-Team veröffentlichte anschließend das September-Sicherheitsrelease 16.3.8. Der nächste sichere Schritt ist ein gesonderter Dependency-Security-Fix mit aktualisiertem Lockfile und notwendigen Regressionen; dieser Vorbereitungsdurchlauf ändert den RC nicht.

## Staging-Konfiguration

`docker compose -f compose.staging.yaml config --quiet` bestand mit rein synthetischen Werten. Es wurde nichts gestartet. Die Datei setzt `METERWERK_ENV=staging`, trennt interne Netzwerk- und Volume-Namen, veröffentlicht Web nur auf Loopback, hängt Web/Worker an getrennte Images und setzt keinen Demo-Seed. DB- und MQTT-Healthchecks sind vorhanden; Web-Readiness prüft `/api/health/ready`. Ein tatsächlicher Provider-/Netzwerk-Nachweis fehlt.

Vor einem echten isolierten Staging-Lauf sind mindestens diese Punkte zu klären:

- Kein Migration-Service/-Schritt in Compose. Eine kontrollierte One-shot-Migration muss aus einem versionierten Admin-/Migration-Image nach erfolgreichem Backup laufen, bevor Web und Worker freigegeben werden. Clean Install und v0.4b-Upgrade sind lokal bestanden, ersetzen den Staging-Lauf nicht.
- Keine expliziten Restart-Policies; Worker besitzen keinen Healthcheck. Web-SIGTERM kann bei laufenden Requests Drain-Zeit über 11,90 Sekunden benötigen. Orchestrator- und Proxy-Timeouts müssen darüber liegen.
- TLS/Reverse-Proxy, DNS/Domain und Zertifikate sind nicht enthalten. Der Loopback-Port ist lokal; externe Bereitstellung braucht vorgeschalteten TLS-Proxy.
- Attachment-Speicher ist ein persistentes lokales Volume, kein externer S3-kompatibler Provider. Backup-Ziel, Zeitplan, Retention, Restore-/PITR-Hooks und Monitoring/Alerting sind nicht provisioniert.
- MQTT ist intern, aber ohne TLS-Konfiguration oder Geräte-Credentials. Für Staging nur synthetische Nachrichten und separat verwaltete Broker-/Receipt-Credentials. Mailadapter sind nicht eingerichtet; die bekannte Implementierung nutzt eine lokale In-Memory-Outbox.
- Image-Variablen erzwingen ein Image, aber keinen Digest. Vor Deploy `repository@sha256:...` statt beweglicher Tags festlegen und zwischen Web/Worker/Promotion abgleichen.
- Readiness prüft Web/DB-Konfiguration; Worker-Heartbeats und MQTT-Verbindung müssen gesondert überwacht werden.

### Benötigte Namen und Ressourcen

Keine Werte oder Secrets wurden erzeugt. Mindestanforderungen für spätere Staging-Verwaltung:

| Bereich        | Namen / Anforderungen                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Origin         | `STAGING_APP_URL`, HTTPS-Domain, `APP_URL`, `BASE_DOMAIN`, `TRUSTED_HOSTS`, `NEXT_PUBLIC_METERWERK_ENV=staging`                             |
| Images         | `METERWERK_IMAGE`, `METERWERK_WORKER_IMAGE`, unveränderliche Digests aus derselben RC-Promotion                                             |
| PostgreSQL     | dedizierte Staging-DB, `STAGING_POSTGRES_PASSWORD`, internes `DATABASE_URL`, Backup-Ziel und Restore-Zugriff                                |
| Session/Crypto | `STAGING_SESSION_SECRET`, unabhängiger MFA-`MFA_ENCRYPTION_KEY`, bei Webhooks `WEBHOOK_SECRET_ENCRYPTION_KEY`; Secret Store                 |
| MQTT           | eigener Staging-Broker, `MQTT_BROKER_URL`, `STAGING_MQTT_RECEIPT_KEY`; bei TLS `MQTT_CA_PATH`, `MQTT_CERT_PATH`, `MQTT_KEY_PATH`            |
| Dateien        | privates Volume oder `ATTACHMENT_STORAGE=s3`, `ATTACHMENT_S3_ENDPOINT`, `ATTACHMENT_S3_BUCKET`, `ATTACHMENT_S3_TOKEN`                       |
| Mail           | zunächst synthetische Outbox; falls Provider verfügbar: `EMAIL_PROVIDER`, `SMTP_URL` oder `EMAIL_API_URL`/`EMAIL_API_KEY`, nur Mail-Sandbox |
| Webhooks/API   | eigene Staging-Ziele und Signing-/API-Secrets, keine Production URLs, Keys oder Empfänger                                                   |
| Observability  | getrennte Logs/Metriken/Traces, Alarmempfänger und Retention; keine standardisierte OTel-Variable im Compose                                |
| Migration/Seed | versioniertes Migration-Image/-Command; kein automatischer Seed; nur explizite synthetische Fixtures                                        |
| Betrieb        | privates Netz, TLS-Proxy, Restart-/Health-Policies, dediziertes Backup-Target, Retention/Löschplan                                          |

## Staging-Smoke nach Provisionierung

Nur nach Bereitstellung einer isolierten Umgebung durchführen:

1. Image-Digests, Build-SHA und Environment `staging` prüfen.
2. Liveness, Readiness und Web-/Worker-Build-Info prüfen.
3. Login, Dashboard, Logout und Session-Ablauf prüfen.
4. Authentifizierte/unauthentifizierte API sowie Mandanten-/Grant-Isolation und Meterliste mit synthetischem Tenant testen.
5. Synthetische Ingestion, Worker-Job und Rules-Execution bestätigen.
6. Synthetische MQTT-Nachricht einspeisen und Persistenz, Tenant-Scope und Logs prüfen.
7. Web-/Worker-Neustart, DB-Unterbrechung/-Recovery und MQTT-Reconnect prüfen; Shutdown-Timeout über dem gemessenen Web-Drain setzen.
8. Backup/Restore nur in ein separates Staging-Restore-Ziel erproben.
9. Smokes nach Wiederanlauf wiederholen und Ergebnisse mit Commit/Digests aufzeichnen.

`scripts/smoke-staging.mjs` prüft nur Liveness, Readiness und Build-Info. Login, API, Ingestion, Worker, Tenant-Isolation, Logout, Restart und Reconnect benötigen zusätzliche Smoke-/E2E-Schritte. Hier wurde kein Staging-Smoke ausgeführt.

## Promotion, Rollback, Signierung und Provider

Workflow-Pfad: CI → manuell erzeugtes Release-Artefakt → extern provisioniertes Staging → manuelle Promotion-Entscheidung. Der Release-Workflow lädt Artefakte hoch und baut Images, pusht und deployed aber nicht. Es gibt keinen automatisierten Staging-zu-Production-Promotionpfad.

App-/Worker-Rollback auf vorherige Digests und Konfiguration ist dokumentiert, aber ohne automatisierte Config-Versionierung. Migrationen werden nicht rückwärts migriert; Restore braucht ein separates geprüftes Ziel oder Forward-Fix. Rollback ist erst nach Restore-Test belastbar. Migration-Reihenfolge und Worker-/Schema-Kompatibilität sind pro Release festzulegen.

Status `SIGNING_PREPARED_NOT_VERIFIED`: lokale BuildKit-Materialien und SBOMs sind keine Signatur. Signer-Identität, Keyless/OIDC-Trust, Registry-Referenz und externe Attestation-/Signaturprüfung fehlen. GitHub Actions wurde nicht ausgeführt.

Providerunabhängige Mindestanforderungen: Linux-Container, PostgreSQL mit Restore/PITR, separater MQTT-Broker, persistenter privater Dateispeicher, TLS, Secret Store, Backups, Monitoring/Alerting, getrennte Worker mit Restart-Policy, privates Netz und harte Staging-/Production-Trennung. Provider noch nicht festgelegt.

## Offene Statusübersicht

| Gate                                      | Status                                  |
| ----------------------------------------- | --------------------------------------- |
| A. CI_CONFIG_VERIFIED                     | PASS                                    |
| B. CI_LOCAL_EQUIVALENT_PASSED             | teilweise; Audit blockiert Gesamtstatus |
| C. CI_REMOTE_RUN_PENDING                  | PENDING; Remote fehlt                   |
| D. STAGING_CONFIG_VERIFIED                | statisch PASS; Laufzeit offen           |
| E. STAGING_DEPLOYMENT_PENDING             | PENDING                                 |
| F. SIGNING_PREPARED                       | JA, lokale Provenance/SBOM              |
| G. SIGNING_VERIFICATION_PENDING           | PENDING                                 |
| H. PROVIDER_VALIDATION_PENDING            | PENDING                                 |
| I. PITR_FULL_RESTORE_PENDING              | PENDING                                 |
| J. HA_FAILOVER_PENDING                    | PENDING                                 |
| K. REPRESENTATIVE_PRODUCTION_LOAD_PENDING | PENDING                                 |

Kein Remote, Staging-Deployment, Production-Zugriff, Push oder Tag wurde verwendet. Dieser Bericht ist Vorbereitung, keine externe Freigabe.
