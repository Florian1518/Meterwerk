# Externes Staging – Meterwerk v1.0 RC

Konfigurationsstand 2026-10-14 für Ubuntu 24.04 auf IONOS und `staging.fesch-elektrotechnik.de`. Apache belegt auf dem Host bereits 80/443; der Meterwerk-VHost ist nur vorbereitet, nicht eingerichtet. Bestehende notrust.me-VHosts sowie Mail-, DNS-, Web-, MariaDB- und Webmin-Dienste bleiben unverändert. Historische Acceptance-Nachweise beziehen sich auf ihre jeweils dokumentierte Revision, nicht automatisch auf diese Änderungen. Aktuelle Images und Migration-Runner müssen aus demselben freigegebenen Commit neu gebaut, geprüft und per Digest ausgewählt werden. Diese Vorbereitung ist kein Deployment- oder Runtime-Nachweis.

**STAGING_DEPLOYMENT_PENDING: JA.** Vorbereitung, kein Deploymentnachweis. Keine Production-Ressourcen, Kundendaten, Hardware, echten Nachrichten oder Abrechnungen verwenden. Keine Ressourcen, Secrets, GitHub Environments oder Tags wurden angelegt. Siehe [Readiness-Bericht](acceptance/STAGING-DEPLOYMENT-READINESS.md).

## Bestand und Lücken

| Bereich    | Vorbereitet                                                                             | Vor externem Start nachzuweisen                                                      |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Web        | Staging-Buildargument, Non-root-Image, Loopback-Port, HTTPS-Proxyvorlage                | Neuer Digest, DNS/Web-TLS, Zugriffsliste, sichtbares STAGING-Label                   |
| Worker     | Drei getrennte Prozesse, Restart/Grace, mTLS-Dateimounts                                | Zertifikatsrechte, Subskription, fachlicher Fortschritt und Drain                    |
| Compose    | `compose.staging.yaml` plus `compose.staging.external.yaml`, internes Netz, Logrotation | Externe Pflichtwerte, gepinnte Digests, Preflight auf dem Zielhost                   |
| PostgreSQL | Version 17, eigener Migration-Runner mit vollständiger Prisma-CLI                       | Leere isolierte DB, Migrationen, Backup/Restore                                      |
| MQTT       | Eigene TLS/ACL-Konfiguration, mTLS-Healthcheck, keine Host-Ports                        | CA/CRL, Server-/Client-/Health-Zertifikate, echte TLS-/ACL-Prüfung                   |
| Storage    | Privates persistentes Attachment-Volume, Image mit vorbereitetem Eigentümer             | Non-root-Schreibrechte des frischen Volumes, Backup, Kapazitätsalarm                 |
| CI         | Manueller GHCR-Publish für Web/Worker/Migrationen mit Commit-SHA-Tags                   | Neuer erfolgreicher Build und dokumentierte Digests; kein Deploymentworkflow         |
| Betrieb    | Host-Proxy-/Env-Vorlagen, Konfigurations-/Image-Preflight, Runbook                      | IONOS-Bereitstellung, Offsite-Backups, Monitoring/Alarmzustellung, Runtime-Nachweise |

Staging ausschließlich mit dem Paar `compose.staging.yaml` und `compose.staging.external.yaml` verwenden, nicht mit compose.yaml, compose.production.yaml oder compose.pilot.yaml kombinieren. Die Basisdatei allein ist keine sichere externe Startkonfiguration. Das Overlay ersetzt insbesondere die alten MQTT-/Health-/URL-Werte. Kein Meterwerk-Container veröffentlicht 80/443, DB- oder MQTT-Ports; Web bindet ausschließlich an `127.0.0.1:3000:3000`. `infra/mosquitto/staging.conf` und `staging.acl` sind die eigenen mTLS-Vorlagen. Die anonyme Development-Konfiguration darf nicht eingebunden werden. [apache-staging.conf.example](../infra/staging/apache-staging.conf.example) beschreibt ausschließlich einen zusätzlichen namensbasierten VHost im vorhandenen Host-Apache. Kein zusätzlicher Proxycontainer oder zweiter Webserver; keine Änderungen an vorhandenen Listenern oder VHosts. Zertifikatspfade sind Platzhalter, Zertifikate werden ausschließlich extern bereitgestellt.

## Zielarchitektur

```text
Internet -> vorhandener Host-Apache:443 -> 127.0.0.1:3000 / Meterwerk Web
                     |
            privates Staging-Netz
            Web, Rules Worker, Rollout Worker, MQTT Worker
            PostgreSQL db:5432, MQTT mqtt:8883 (mTLS)
            privates persistentes Attachment-Volume
            kurzlebiger Migration-Runner

Backups -> verschlüsselter separater Speicher außerhalb des DB-Volumes
```

Der vorhandene Host-Apache routet später ausschließlich den neuen Staging-VHost auf Loopback:3000. Kein Edge-/Proxycontainer und keine Übernahme der Host-Ports 80/443 durch Compose. DB bleibt db:5432, MQTT mqtt:8883 im internen Containernetz. Für Meterwerk öffentlich nur HTTPS sowie HTTP-Redirect; Administration über eingeschränkten SSH-/VPN-Zugang. Worker, DB, MQTT und MQTT-WebSockets bleiben privat. Bestehende Hostdienste und ihre Freigaben werden hier weder umkonfiguriert noch abgeschaltet.

Das bestehende internal-Netz verhindert regulären externen Egress. Externe Webhooks/Storage/Mail benötigen später kontrollierten Egress; anfangs deaktivieren. Getrennte Staging-Daten, Volumes und Secrets, keine Production-Credentials. Eine einzelne VM ist keine HA-Architektur.

## Environment-Inventar

REQUIRED bedeutet verbindlich für sicheren Staging-Betrieb, auch wenn der Code Defaults zulässt. OPTIONAL wird bei aktivierter Funktion bedingt erforderlich. EXTERNAL_PROVIDER_REQUIRED bezeichnet noch offene Infrastrukturangaben. Ausschließlich Namen und Anforderungen, keine Secretwerte.

| Variablen                                                                                              | Klasse                     | Anforderung                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| METERWERK_ENV, NODE_ENV                                                                                | REQUIRED                   | staging und production für Web/Worker                                                                        |
| APP_URL, STAGING_APP_URL                                                                               | REQUIRED                   | Identische externe HTTPS-Origin; kein localhost-Default                                                      |
| BASE_DOMAIN, TRUSTED_HOSTS                                                                             | REQUIRED                   | Gewählte Domain/Hostliste explizit, keine implizite Projekt-Domain                                           |
| DATABASE_URL                                                                                           | REQUIRED                   | Dedizierte Staging-DB, Host db, Port 5432; Passwort URL-kodieren                                             |
| STAGING_POSTGRES_PASSWORD                                                                              | REQUIRED                   | Eigenes starkes Secret; Compose setzt POSTGRES_PASSWORD                                                      |
| POSTGRES_USER, POSTGRES_DB                                                                             | REQUIRED                   | Im Compose festgelegt auf meterwerk_staging                                                                  |
| SESSION_SECRET, STAGING_SESSION_SECRET                                                                 | REQUIRED                   | Gleicher eigener Staging-Schlüssel, mindestens 32 Zeichen                                                    |
| MFA_ENCRYPTION_KEY                                                                                     | REQUIRED                   | Stabiler eigener Schlüssel, mindestens 32 Zeichen, kein Development-Fallback                                 |
| WEBHOOK_SECRET_ENCRYPTION_KEY                                                                          | REQUIRED                   | Unabhängiger Schlüssel, mindestens 32 Zeichen; Web und MQTT-Worker konsistent                                |
| MQTT_BROKER_URL                                                                                        | REQUIRED                   | mqtts mit internem Host mqtt und Port 8883; keine Zugangsdaten in URL                                        |
| MQTT_CA_PATH, MQTT_CERT_PATH, MQTT_KEY_PATH                                                            | REQUIRED                   | Für gewähltes mTLS-Ziel: read-only Secretdateien; Worker-CN meterwerk-ingestion, Server-SAN mqtt             |
| MQTT_RECEIPT_KEY_PATH, STAGING_MQTT_RECEIPT_KEY                                                        | REQUIRED                   | Containerpfad und Host-Dateipfad eines eigenen privaten Receipt-Signaturschlüssels                           |
| METERWERK_IMAGE, METERWERK_WORKER_IMAGE                                                                | REQUIRED                   | Registry-Referenzen mit immutable sha256-Digest                                                              |
| NEXT_PUBLIC_METERWERK_ENV                                                                              | REQUIRED                   | staging-Label bereits beim Next-Build; Runtimevariable allein reicht nicht                                   |
| ATTACHMENT_STORAGE, ATTACHMENT_LOCAL_ROOT                                                              | REQUIRED                   | Zunächst local und persistenter privater Mount /app/.local/attachments                                       |
| EMAIL_PROVIDER                                                                                         | REQUIRED                   | local: flüchtige In-Memory-Outbox, kein externer Versand                                                     |
| LOG_LEVEL                                                                                              | REQUIRED                   | INFO, keine Secret-/Payload-Diagnose                                                                         |
| RATE_LIMIT_BACKEND                                                                                     | OPTIONAL                   | Ungesetzt PostgreSQL; local im externen Staging nicht verwenden                                              |
| SMTP_URL, EMAIL_API_URL, EMAIL_API_KEY                                                                 | OPTIONAL                   | Erst mit Versandauftrag und implementiertem Adapter; aktuelle SMTP/API-Zweige liefern accepted:false         |
| ATTACHMENT_S3_ENDPOINT, ATTACHMENT_S3_BUCKET, ATTACHMENT_S3_TOKEN                                      | OPTIONAL                   | Nur bei Storagewechsel; vorhandenen HTTP/Bearer-Adapter auf Providerkompatibilität prüfen                    |
| CLAMAV_HOST, CLAMAV_PORT                                                                               | OPTIONAL                   | Privater Scanner bei Attachment-Scan; Quarantäne/Fehlerverhalten testen                                      |
| SEED_DEMO, DEMO_PASSWORD                                                                               | OPTIONAL                   | Nur expliziter lokaler Development-Fixture-Job; Passwort mindestens 14 Zeichen; niemals dauerhaft im Staging |
| SMOKE_BASE_URL                                                                                         | REQUIRED                   | Vor Smoke explizit auf HTTPS-Staging setzen; Script hat tatsächlich localhost-Fallback                       |
| VERSION, GIT_SHA, BUILD_TIMESTAMP, GIT_WORKING_TREE                                                    | REQUIRED                   | Buildargumente: tatsächliche Revision, UTC-Zeit, sauberer Worker-Quellstand                                  |
| RELEASE_VERSION, GIT_COMMIT_SHA, BUILD_VERSION                                                         | REQUIRED                   | Release-/Buildmetadaten passend zum Artefakt; validierter SHA ersetzt nicht tatsächlichen Build-SHA          |
| Registry-Endpunkt/Repositories/Identitäten, DNS/TLS-Zugang, Backupziel/Verschlüsselung, Monitoringziel | EXTERNAL_PROVIDER_REQUIRED | Infrastrukturvertrag nach Providerwahl; keine vorhandenen universellen App-Variablen                         |

MQTT_URL ist kein Worker-Verbindungsalias. Separate MQTT_HOST/MQTT_PORT werden nicht gelesen. STORAGE_ENDPOINT, WEBHOOK_BASE_URL, PUSH_API_URL und BACKUP_STORAGE_ENDPOINT kommen in Isolation-Prüfungen vor, konfigurieren aber keinen Dienst. API-Schlüssel und Webhook-Signatursecrets werden fachlich verwaltet; keine allgemeine API_KEY-/SIGNING_SECRET-Variable. Gateway-Schlüssel werden separat registriert; Benutzer-Cookies sind kein Gerätezugang. Kein Error-Tracking-DSN oder Backup-Scheduler wird durch erfundene Variablen eingerichtet.

Das externe Overlay reicht MFA-/Webhook-Schlüssel, Hostkonfiguration und mTLS-Mounts explizit durch. Als Inventar ausschließlich [staging.env.example](../infra/staging/staging.env.example) verwenden: erforderliche Secrets und Image-Referenzen sind absichtlich leer. Die lokale Development-.env nicht übernehmen. `STAGING_DATABASE_URL` enthält das URL-kodierte Passwort und wird als `DATABASE_URL` injiziert; der Preflight vergleicht es mit `STAGING_POSTGRES_PASSWORD`. `BASE_DOMAIN` und `TRUSTED_HOSTS` sind auf den einzelnen Staging-Host festgelegt. `STAGING_SESSION_SECRET` wird in allen App-Prozessen zu `SESSION_SECRET`. `SMOKE_BASE_URL` ist eine Operatorvariable. Buildargumente gehören zum CI-Build, nicht in eine Runtime-Secretdatei. Isolation-Guards sind heuristisch und kein Nachweis der Provider-/Kontozugehörigkeit.

## Container und GitHub-Verknüpfung

Commit -> erfolgreiche CI -> getrennte Linux-amd64-Web-/Worker-/Migration-Builds -> manueller Publish nach GHCR -> aufgezeichnete Digests -> manuelle Staging-Promotion. `publish-images.yml` veröffentlicht `ghcr.io/florian1518/meterwerk-web`, `meterwerk-worker` und `meterwerk-migrations`, jeweils mit exaktem Commit-SHA als Tag. Alle Builds, Artifact-/Static-/Runtime-Smokes einschließlich Migration-Tooling und isolierter CI-Datenbank laufen vor dem Registry-Login. Die Workflow-Policy sichert die drei erlaubten Repository-/SHA-Tag-Paare und diese Reihenfolge ab. Tags dienen nur zur Suche; Deployment per Digest. `release.yml` bleibt ein prüfender Workflow ohne Registry-Push. PostgreSQL 17 und Mosquitto 2 über `STAGING_POSTGRES_IMAGE`/`STAGING_MQTT_IMAGE` ebenfalls mit geprüften Digests pinnen; die bestehende Apache-Paketversion dokumentieren, keinen globalen Webserverwechsel durchführen. Jetzt keinen Workflow starten.

Frozen Lockfile vorhanden; mutable node:22-alpine verhindert die Behauptung byteidentischer Rebuilds. Beim Build Basisdigests/Toolchain erfassen, Buildargumente, SBOM, OCI-Revision und Digests archivieren. Der Web-Dockerfile erhält `NEXT_PUBLIC_METERWERK_ENV` vor `pnpm build`; der Publish-Workflow setzt explizit `staging`. Das Image trägt zusätzlich `de.meterwerk.environment=staging`. Ein neuer Web-Build ist erforderlich; eine Runtimevariable kann alte Browser-Bundles nicht korrigieren. Worker und Migration-Runner werden im selben Publish aus derselben Revision erzeugt. Der Worker-Build prüft unveränderte getrackte Quelldateien vor `GIT_WORKING_TREE=clean`; generierte Audit-Nachweise zählen nicht zum Worker-Quellstand. Keine Secrets als Buildargs. Das separate `Dockerfile.migrations` enthält Prisma-CLI, eingefrorene vollständige Dependencies, Schema/Migrationen und den unveränderten Baseline-Check. Web-/Worker-Runtime bleiben schlank; insbesondere der Worker enthält weder Prisma-CLI noch Paketmanager.

Vorgeschlagene spätere GitHub-Namen, noch nicht implementiert: Environment staging; REGISTRY_HOST, REGISTRY_WEB_REPOSITORY, REGISTRY_WORKER_REPOSITORY, REGISTRY_USERNAME, REGISTRY_PUBLISH_TOKEN, STAGING_SSH_HOST, STAGING_SSH_USER, STAGING_SSH_PRIVATE_KEY, STAGING_SSH_KNOWN_HOSTS. OIDC/kurzlebige Identitäten bevorzugen, sofern unterstützt. Publish-Recht nur für CI, Pull-Recht am Host. App-/DB-Secrets im Staging-Secretstore, keine Production-Rechte. Reviewer, Deployment-Sperre und Artefaktretention später einrichten. Kein grundloser erneuter Remote-CI-Lauf.

## Migration und synthetische Daten

Der neue isolierte DB-Zielbestand muss leer sein. Anzahl und Namen der Migrationen aus dem tatsächlich gewählten Commit prüfen, keine historische feste Anzahl als Sollwert verwenden. Der kurzlebige Service `migrations` liegt ausschließlich im Profil `operations` und im privaten Netz. Er verwendet `METERWERK_MIGRATIONS_IMAGE` per Digest. Corepack/pnpm und Prisma werden beim Image-Build bereitgestellt; Registry-Zugriff ist für die Runtime nicht nötig. `DATABASE_URL` wird sicher injiziert; keine DB-Portfreigabe als Abkürzung. Der Standardbefehl ist nur `prisma migrate status`, niemals eine automatische Schemaänderung.

Sequenziell, jeder Fehler stoppt den Rollout:

```sh
dc run --rm --no-deps migrations sh -ec 'pnpm db:generate && pnpm db:migrate && pnpm exec prisma migrate status'
```

Erst nach DB-Health und erfolgreichem Image-Preflight manuell ausführen. Alle drei Befehle laufen sequenziell im selben kurzlebigen Container; jeder Fehler beendet ihn erfolglos. Der db:migrate-Befehl prüft read-only Historie/Checksummen und führt prisma migrate deploy aus. Alle Migrationen des gewählten Commits müssen abgeschlossen sein. Kein migrate dev, db push, reset oder Kaschieren von Checksummen. Web/Worker bleiben bis Erfolg gestoppt. Der Runner wird anschließend entfernt; keine Migration beim normalen App-/Workerstart.

Demo-Seed verweigert staging und verändert bei Wiederholung unter anderem Pläne/Subscriptions. Deshalb kein Seed im Staging-Start. Sicherer Vorbereitungsweg: einmaliger Seed in neuer isolierter lokaler Development-DB derselben Revision mit explizitem SEED_DEMO und geheim verwaltetem DEMO_PASSWORD; ausschließlich nachweisbar synthetische Daten exportieren. Für frisch migriertes Staging einen geprüften Daten-only-Import verwenden, FK-Reihenfolge/Transaktion beachten. Alternativ vollständigen synthetischen Dump in noch leere DB restaurieren und danach Baseline/Migrationsstatus prüfen; nicht beide Schemawege mischen. Kein Production-Dump, keine Umdeklaration bestehender Staging-DB als development. Individuelle Testzugänge vor Öffnung einrichten, gemeinsame Demo-Zugangsdaten nicht veröffentlichen, Seedvariablen entfernen. Ohne geprüfte Konten/Fixtures bleiben Login-/Tenant-Smokes offen.

## Health, Shutdown und Restart

Web live prüft Prozessantwort; ready prüft SELECT 1 und Secrets nur bei METERWERK_ENV=production. Kein MQTT-/Worker-/Storage-Nachweis. Build-Info ist aktuell unauthentifiziert. PostgreSQL pg_isready durch authentifizierte SQL-/Migrationsprüfung ergänzen. MQTT mit mTLS und freigegebenem Health-Topic sowie synthetischem Pub/Sub aus privatem Netz prüfen; anonymen localhost-$SYS-Check für mTLS ersetzen.

Mindestvorgabe: Web stop_grace_period **30s** gegenüber ca. 11,90s gemessenem bisherigen Drain; Worker und PostgreSQL **60s**, MQTT/Proxy **30s**. Aktive Jobs können länger dauern: im Staging messen und Frist erhöhen; SIGKILL/Exit 137 ist kein erfolgreicher Drain. Proxy aus Routing nehmen, Web drainen, Worker stoppen, Broker/DB zuletzt.

Das Overlay setzt für Web, drei Worker, DB und MQTT `restart: on-failure:5`, Web/MQTT 30s sowie Worker/DB 60s Grace. Docker Compose unterstützt diese Restart-Policy; sie startet nach einem Docker-/Host-Neustart nicht automatisch den ganzen Stack. Host-Neustart über kontrollierten Service-Start mit Preflight absichern. Docker-Retryzähler ist kein dauerhafter Circuit Breaker: bei mehr als fünf Starts in zehn Minuten extern alarmieren und bis Diagnose stoppen. Keine blinde Autoheal-Schleife. Lebender Prozess kann fachlich stillstehen: Heartbeat/Zyklus/Queuefortschritt separat überwachen. Readiness steuert Traffic, nicht allein Restarts. Logrotation: json-file, 10 MiB x 5 pro Service; zentrale 14-Tage-Retention bleibt ein externer Betriebsauftrag.

## TLS und Security

A/AAAA oder Provider-CNAME für gewählten Host; AAAA nur mit funktionierendem IPv6. HTTPS 443, HTTP nur Redirect/ACME. Zertifikat mit korrektem SAN, persistenter Zertifikatsspeicher, automatische Erneuerung/Ablaufalarm; alternativ DNS-01. Keine Domain erfunden.

Proxy prüft erlaubten Host, überschreibt Forwarded-/X-Forwarded-Host/-Proto/-For und entfernt untrusted Header. Backend nur vom Proxy erreichbar. App-CSP/Nonce, nosniff, Frame-/Referrer-/Permissions-Header vorhanden. Hostablehnung, HTTPS-Redirect und HSTS im App-Proxy greifen nur für production: für staging verbindlich am Reverse Proxy erzwingen. HSTS zunächst nur gewählten Host betreffend, kein ungeprüftes preload/includeSubDomains.

Cookies durch NODE_ENV=production Secure, außerdem HttpOnly/SameSite=Lax; Browserprüfung ausstehend. Origin/CSRF, PostgreSQL-Rate-Limiter, Tenantgrenzen und PropertyGrants prüfen; SUPER_ADMIN braucht explizite Mandantenwahl. Zugang zunächst VPN/IP-Allowlist oder Testzugang am Proxy. Health/Build-Info auf Monitoring/Testzugang beschränken, Admin-/Operations-/Debugzugriffe nicht anonym. Keine Default-/CI-/Development-Passwörter. MQTT per mTLS/ACL; eigene Geräteidentitäten. Kein zwingender öffentlicher WebSocket-Dienst nachgewiesen, MQTT-WebSockets bleiben zu; Proxy-Upgrade nur bei nachgewiesenem Bedarf.

## Backup und Monitoring

scripts/backup.ts verwendet Standard-Compose und meterwerk als DB/User: nicht unverändert für Staging verwenden. Backupziel getrennt vom DB-Volume, verschlüsselt und zusätzlich außerhalb des Hosts. Täglich plus vor Migration; zunächst 7 tägliche/4 wöchentliche Kopien. Attachments zeitlich konsistent mitsichern. Planungsziel RPO 24h/RTO 4h, erst nach Test belegt.

Später auf Linux, nach Definition von dc im Runbook und sicherer Bereitstellung eines neuen BACKUP_FILE-Pfads im getrennten Ziel:

```sh
umask 077
set -C
dc exec -T db pg_dump -U meterwerk_staging -d meterwerk_staging -Fc --no-owner --no-acl > "$BACKUP_FILE"
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
dc exec -T db pg_restore --list < "$BACKUP_FILE" > /dev/null
```

Bei Fehler/Teildump kein Erfolg. Restore auf separater Instanz/Volume in neue meterwerk*restore*\*-DB: Prüfsumme, createdb mit passendem Nutzer, pg_restore --exit-on-error --single-transaction --no-owner --no-acl. Nie aktive DB überschreiben. Migrationstand, Tenant-/Messwertzahlen, Attachments, Login/Ready prüfen; Dauer/Datenverlustfenster protokollieren. Keys/Config separat wiederherstellbar halten. WAL-Archivierung/PITR nicht eingerichtet: PITR_FULL_RESTORE_PENDING.

Minimum: geschützte zentrale Web-/Worker-/MQTT-Logs, Rotation zunächst 10 MiB x 5 pro Container, zentrale Retention 14 Tage; keine Tokens/Requestbodies. Live/Ready alle 30s, Alarm nach drei Fehlern. DB-Verbindungen/Platz, MQTT-Verbindung/Subskription, Workerprozesse/Leases/Zyklen, Queueanzahl/ältester Job/Retries/Fehler überwachen. Rules/Rollout pollen 30s; fehlenden Fortschritt nach 120s untersuchen. CPU >85% für 10min, RAM >85% für 5min, Disk >75% Warnung/>85% kritisch, OOM/Restart Counts, Backupalter >26h, Zertifikatsablauf <21 Tage. Schwellen sind Startannahmen. Externe Metrikpipeline/Errortracking/Alarmzustellung fehlen; ohne Auftrag kein realer Nachrichtenversand.

## Deployment-Runbook

Vorbereiteter Operatorplan, hier nicht ausgeführt. `compose.staging.external.yaml`, MQTT-Konfiguration, Host-Proxyvorlage und Preflight sind vorhanden. Kein Start mit fehlenden externen Dateien, ungeprüften Digests oder fehlenden Infrastrukturvoraussetzungen. Für die Preflight-Scripts wird Node.js 22.12+ auf dem Admin-/Zielhost benötigt; Docker Compose muss die hier statisch geprüfte Syntax unterstützen.

1. Provider/Server explizit beauftragen, separate Ressourcen/Backupziel/Administration bereitstellen.
2. Gewählten DNS-Record setzen und Auflösung/Eigentum prüfen.
3. Privates Netz und Volumes, Proxy-Backendzugang und gegebenenfalls kontrollierten Egress definieren.
4. Secrets über Providerstore oder rootgeschützte externe Datei/Mounts hinterlegen. Zielkonten prüfen. Keine Shell-Traces oder Environment-Ausgabe über docker inspect/compose config.
5. Web-/Worker-Images bereitstellen, Digest/Revision/SBOM erfassen; Infrastrukturimages pinnen. Auf Linux Operatorfunktion definieren:

   ```sh
   set -eu
   dc() { docker compose --project-name meterwerk-staging --env-file "$STAGING_ENV_FILE" -f compose.staging.yaml -f compose.staging.external.yaml "$@"; }
   dc --profile operations config --quiet
   node scripts/verify-staging-config.mjs "$STAGING_ENV_FILE"
   dc --profile operations pull
   node scripts/verify-staging-config.mjs "$STAGING_ENV_FILE" --images
   ```

   STAGING_ENV_FILE ist ein sicher injizierter externer Dateipfad. Syntaxcheck ersetzt keine Ziel-/Secretprüfung.

6. `dc up -d --no-deps db`: neue isolierte DB starten.
7. `dc up -d --no-deps mqtt`: privaten mTLS-Broker starten.
8. `dc ps`, selektiven Healthstatus, SQL und mTLS-Pub/Sub prüfen; bei Fehler stoppen.
9. Migration-Runner wie oben explizit ausführen, Exitcode und vollständigen Migrationsstand dieses Commits bestätigen. Kein Web-/Workerstart bei Fehler.
10. Bei leerer User-Tabelle den ersten SUPER_ADMIN wie unten manuell anlegen. Kein Demo-Seed im Staging.
11. `dc up -d --no-deps rules-worker rollout-worker mqtt-worker`; Zyklen/Leases/Subskription prüfen.
12. `dc up -d --no-deps web`; private Live/Ready prüfen, erst dann vorbereiteten Proxy aktivieren.
13. HTTPS/TLS/Redirect/Host/Security-Header prüfen.
14. Folgenden Smokeplan ausführen, bei kritischem Fehler stoppen.
15. Geschützte Logs auf Fehler/Secretlecks prüfen; nur redigierte Evidenz archivieren.
16. Backup und isolierten Restore testen.
17. Kompatiblen APP_ROLLBACK testen. Erstdeployment ohne Vorgängerdigest erlaubt nur Stopp/Wiederanlauf desselben Images, keinen belegten Versionsrollback.

## Staging-Smoke-Checkplan

Vorbedingung: synthetische Konten zweier Mandanten, TENANT_ADMIN, USER mit/ohne PropertyGrant, SUPER_ADMIN; registrierter signierender Software-Gatewayclient im privaten Netz. Keine Hardware. Je Schritt UTC-Zeit, Digest, Soll/Ist und redigierte Evidenz erfassen; kein PASS ohne Ausführung.

| Test                 | Aktion                                                                                                                           | Erwartung                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| HTTPS                | HTTPS ohne insecure öffnen; HTTP und Fremdhost testen                                                                            | Gültiges Zertifikat, kanonischer Redirect, Fremdhost abgelehnt                                             |
| Basis                | SMOKE_BASE_URL explizit injizieren; `pnpm smoke:staging`                                                                         | live, ready, build-info 200; erwarteter SHA; Script prüft nur diese drei Endpunkte                         |
| Login/Session        | Login, Dashboard, Zählerliste, Reload, Logout, geschützte URL erneut                                                             | Eigene Daten; Session gültig bis Logout, danach gesperrt; Secure/HttpOnly/Lax                              |
| API                  | /api/meters mit und ohne gültige Session                                                                                         | Autorisiert 200, anonym 401/403, kein Datenleck                                                            |
| Tenant               | Fremde ID/tenantId, USER ohne Grant, Nachfahren/Aggregation/Export, Rolleneskalation                                             | Keine fremden Daten oder Rechte; SUPER_ADMIN ohne Auswahl kein impliziter Mandant                          |
| MQTT                 | Software-Gatewaynachricht mit gültiger Signatur publizieren, Receipt prüfen, Duplikat/fremdes Topic/ungültige Signatur versuchen | Reading mit richtiger Einheit/UTC/Tenant persistiert, Duplikat nicht doppelt, ungültige Zugriffe abgelehnt |
| Rules                | Synthetische Regel/Messwert, zwei Pollzyklen warten                                                                              | Erwartetes Ergebnis/Jobabschluss, kein realer Versand                                                      |
| Rollout              | Job für synthetischen Software-Gateway planen, Fortschritt prüfen                                                                | Worker verarbeitet Job ohne Hardware, Retry/Fehler nachvollziehbar                                         |
| Web Restart          | `dc restart -t 30 web`, Basis/Login wiederholen                                                                                  | Ready wiederhergestellt, keine Datenverluste                                                               |
| Worker Restart       | `dc restart -t 60 rules-worker rollout-worker mqtt-worker`                                                                       | Zyklen/Leases/Subskription erholen sich, keine doppelten Effekte                                           |
| PostgreSQL Reconnect | `dc stop -t 60 db`, Ready prüfen, `dc start db`                                                                                  | Ready 503 beim Ausfall; später 200 und Workerfortschritt                                                   |
| MQTT Reconnect       | `dc stop -t 30 mqtt`, `dc start mqtt`, erneut Software-Publish                                                                   | Reconnect, Subskription, Reading/Receipt; Web-Ready allein reicht nicht                                    |
| Drain                | Synthetische Anfrage/Job aktiv; `dc stop -t 30 web`, Worker separat mit -t 60; gezielt starten                                   | Frist eingehalten, kein SIGKILL, keine verlorenen bestätigten Readings                                     |
| Logs/Storage         | Redigierender Secretcheck der geschützten Logs; Attachment speichern/lesen, Neustart                                             | Keine Secretwerte/Tokens, privates Attachment persistent                                                   |
| Recovery             | Separater Restore und kompatibler Digestrollback                                                                                 | Fachliche Daten wiederhergestellt, kritischer Smoke erneut erfolgreich                                     |

Vorhandene lokale Acceptance-/Hardware-/Integration-Scripts nicht blind auf Staging richten: manche seeden oder erzwingen lokale Test-DBs. MQTT-Nachrichten nach [MQTT-Vertrag](MQTT.md) und apps/edge-gateway/src/wire.ts erstellen; Fixture-IDs/Keys erst in isolierter Umgebung festlegen. Keine Keys/Nutzdaten in Evidenz.

## Rollback

APP_ROLLBACK: vor Update bisherige und neue Web-/Worker-Digests, Configversion, Secretversionreferenzen erfassen. Traffic stoppen, Worker drainen, Schema-/Job-/Wire-Kompatibilität anhand Migrationdiff prüfen. Bei kompatiblem Schema vorheriges Digestpaar und passende Konfiguration einsetzen, starten, Ready/Smoke prüfen. Schlüsselrotation nicht blind zurückdrehen. Bei Inkompatibilität Stop/Vorwärtsfix.

DATABASE_ROLLBACK: eigener autorisierter Restore mit Schreibstopp, Datenverlustfenster, neuer DB, passenden Attachments/Keys und Prüfung vor Umschaltung. Keine pauschal sichere Rückmigration; kein Prisma reset/resolve als Routine. Beim Erstdeployment existiert noch kein vorheriger Staging-Digest.

## Provider und Kapazität

Planungsminimum für kleine synthetische Last: **2 vCPU, 8 GiB RAM, 80 GiB SSD**, separates Backupziel zunächst **40 GiB**, nach Datenmenge anpassen. RAM: Web 1,5 GiB; drei Worker 1,5 GiB; PostgreSQL 2 GiB; MQTT/Proxy 0,5 GiB; OS/Cache/Reserve 2,5 GiB. Disk: OS/Images 20 GiB, DB 20 GiB, Attachments/MQTT 10 GiB, Logs/Arbeitsplatz 10 GiB, Reserve 20 GiB. Images extern bauen. Paralleler Restore braucht zusätzliche Kapazität/separate Instanz; 4 vCPU komfortabler für parallele Tests. Schätzung, keine Production-Dimensionierung und kein Lastnachweis.

Ziel ist IONOS mit Linux amd64 und `staging.fesch-elektrotechnik.de`. Der Server muss Container/Compose, Web plus drei Worker, PostgreSQL, MQTT/mTLS, persistente Volumes, private Netze, öffentliche HTTPS-Adresse, DNS/TLS-Erneuerung, Secrets, Restartkontrolle, Backups/Restore, Monitoring, Registryzugriff und eingeschränkte Administration ermöglichen. Konkrete Instanz, Kapazität und Providerfunktionen sind vor Bereitstellung zu bestätigen.

Offen: STAGING_DEPLOYMENT_PENDING, PITR_FULL_RESTORE_PENDING, HA_FAILOVER_PENDING, REPRESENTATIVE_LOAD_PENDING, HARDWARE_VALIDATION_PENDING.

Noch extern festzulegen: konkrete IONOS-Instanz/Region, DNS-/Adminverantwortliche, erlaubte VPN-/Tester-IP-Adressen, Offsite-Backupziel/Verschlüsselung und Monitoring-/Alarmziel. Zugangsdaten später sicher hinterlegen, nicht im Chat/Repository. Diese Angaben und die Runtime-Abnahme können durch Repository-Konfiguration nicht ersetzt werden.

## Externe Dateien und Host-Vorbereitung

Noch keine dieser Secret-/Zertifikatdateien ist erzeugt. Alle Hostpfade werden über die Variablen aus [staging.env.example](../infra/staging/staging.env.example) angegeben, absolut und außerhalb des Checkouts. Bind-Mounts sind read-only mit `create_host_path: false`; fehlende Dateien dürfen nicht als leere Verzeichnisse angelegt werden.

- Externe `STAGING_ENV_FILE`, Modus 0600: vier unabhängige starke Werte (DB, Session, MFA, Webhook; jeweils mindestens 32 Zeichen), URL-kodierte DB-URL, Release/SHA, fünf freigegebene Image-Digests, alle Hostpfade. Für die DB sind eigene zufällige Hexwerte praktisch, da sie keine URL-Sonderzeichen oder Compose-Interpolation enthalten. Keine Beispiel-/CI-Passwörter einsetzen. Keine Secretwerte in Shell-History, Logs, `compose config`-Ausgaben oder Chat kopieren.
- Eigene Staging-CA: öffentlicher CA-Nachweis und aktuelle CRL; privater CA-Schlüssel offline und verschlüsselt verwalten, **niemals mounten**. Ablauf/CRL-Erneuerung überwachen. Keine Production-CA/Identitäten übernehmen.
- Server-Zertifikat mit SAN `DNS:mqtt`, EKU serverAuth, dazu privater Schlüssel. Worker-Zertifikat mit CN `meterwerk-ingestion`, EKU clientAuth und eigenem privaten Schlüssel. Health-Zertifikat mit CN `meterwerk-health`, EKU clientAuth und eigenem privaten Schlüssel. Der Healthcheck nutzt ausschließlich `meterwerk/staging/health`; fachliche Topics sind für diese Identität gesperrt.
- Separater privater Ed25519-Receipt-Signaturschlüssel im PEM-Format unter `STAGING_MQTT_RECEIPT_KEY`; zugehöriger öffentlicher Schlüssel für spätere autorisierte Software-Gatewaytests. Dies ist kein TLS-Schlüssel. Keine Hardware-/Gateway-Identität wird mit diesen Vorlagen freigeschaltet.
- Externe, unveränderte Kopien von [staging.conf](../infra/mosquitto/staging.conf) und [staging.acl](../infra/mosquitto/staging.acl). Der Preflight vergleicht sie mit der freigegebenen Revision. Neue Software-Gateway-ACLs erfordern eine eigene geprüfte Änderung; keine anonymen Zugänge oder globalen Wildcard-Rechte.
- HTTPS-Zertifikatskette/Key für `staging.fesch-elektrotechnik.de`, Erneuerung passend zum bestehenden Host-Zertifikatsmanagement und später kontrollierter graceful Apache-Reload. Die Vorlage enthält ausschließlich `__STAGING_WEB_TLS_CERT__` und `__STAGING_WEB_TLS_KEY__`, keine vermuteten Zertifikatspfade. DNS-01 ermöglicht die Ausstellung vor der Öffnung; die mitgelieferte HTTP-Konfiguration stellt keinen HTTP-01-Webroot bereit. AAAA erst bei geprüften bestehenden IPv6-Listenern und Routing aktivieren; keine globalen Listen-Direktiven ergänzen.
- Externe Apache-Zugriffsliste aus [apache-allowlist.conf.example](../infra/staging/apache-allowlist.conf.example), ausschließlich innerhalb des neuen Staging-VHosts. Nur freigegebene VPN-/Tester-/Monitoring-IP-Adressen ergänzen; alle anderen bleiben abgelehnt. Die Regeln verwenden die physische Peeradresse `CONN_REMOTE_ADDR`, nicht ungeprüfte Forwarded-Header oder eine durch gemeinsame mod_remoteip-Regeln umgeschriebene Adresse. Sie schützen auch Health und Build-Info. Bestehende Firewall-/Mail-/DNS-/Webmin-Regeln nicht pauschal ersetzen; für Meterwerk niemals 3000, 5432, 1883 oder 8883 öffentlich öffnen.

Dateirechte auf Linux anhand der tatsächlichen Container-UIDs prüfen: Worker als `meterwerk`, Migrationen als `node`, Broker als Benutzer des gepinnten Mosquitto-Images. Private Keys nur für root und die jeweilige Dienst-UID/Gruppe lesbar, z. B. 0640 mit passender Gruppe; nicht world-readable. Verzeichnisse müssen für die benötigte UID traversierbar sein. Read-only-Mounts ändern keine Dateirechte. Das neue Attachment-Volume übernimmt den Eigentümer des im Web-Image vorbereiteten `/app/.local/attachments`; bestehende Volumes benötigen eine separate Eigentümerprüfung, keinen pauschalen Root-Betrieb.

Die Apache-Vorlage nur in eine neue, noch nicht aktivierte Staging-Site-Datei übernehmen. Die drei `__STAGING_*__`-Platzhalter durch tatsächlich vorhandene, geprüfte absolute Dateipfade ersetzen. `STAGING_WEB_TLS_CERT`, `STAGING_WEB_TLS_KEY` und `STAGING_ACCESS_ALLOWLIST` im Env-Inventar dienen dabei nur der Pfaddokumentation; sie werden nicht automatisch in Apache eingesetzt. Vor einer späteren Aktivierung auf IONOS:

```sh
apache2ctl -M
apache2ctl -S
apache2ctl configtest
```

Benötigte Module: ssl, proxy, proxy_http, headers, rewrite, authz_core. Fehlende Module und gemeinsam geerbte Einstellungen erst prüfen; keine globalen Änderungen oder pauschalen Neustarts auf dem gemeinsam genutzten Server ausführen. Beim späteren Einbinden sicherstellen, dass der bisherige erste/default VHost unverändert bleibt, keine ServerName-/ServerAlias-Kollision entsteht und notrust.me weiterhin seine bisherigen Zertifikate, Weiterleitungen und Inhalte liefert. Ein Configtest vor der Einbindung prüft die unaktivierte Datei noch nicht; vor einem Reload muss die Gesamt-Konfiguration **einschließlich** der neuen Datei geprüft werden. Kein Platzhalter darf übrig bleiben.

Die Vorlage setzt HTTP→HTTPS-Redirect und Hostprüfung nur für Staging. `ProxyRequests Off` verhindert einen Forward-Proxy, `ProxyPassInherit Off` übernimmt keine globalen Proxy-Routen. `ProxyAddHeaders Off` und explizites Entfernen/Setzen der üblichen Forwarded-Header verhindern das Anhängen ungeprüfter Clientwerte. Host/Origin werden auf die Staging-Domain/HTTPS und Client-IP auf die physische Verbindung gesetzt; HSTS gilt nur für diesen Host ohne includeSubDomains/preload. Ausschließlich Loopback:3000 ist Backend. Referenzen: [Apache RequestHeader](https://httpd.apache.org/docs/2.4/mod/mod_headers.html#requestheader), [ProxyAddHeaders](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html#proxyaddheaders). Kein Backend-Egress-Netz wird hinzugefügt. Aktivierung und kontrollierter graceful Reload erfolgen erst in einem gesondert freigegebenen Schritt nach privater App-Abnahme und Regression der bestehenden Dienste. Apache ist für Meterwerk noch nicht eingerichtet.

## Vorbereitungsprüfung und verbleibende Betriebsfreigaben

`node --test scripts/staging-config.test.mjs` prüft die tatsächliche Compose-Zusammenführung mit rein synthetischen Werten und ohne Daemon/Containerstart. Negative Fälle decken öffentliche Ports, fehlende oder wiederverwendete Secrets, falsche Datenbank/Origin, Seed-Konfiguration, falsche Mounts und abweichende Image-Provenienz ab. `verify-staging-config.mjs` prüft die externen Dateien und Einstellungen; `--images` vergleicht lokal gepullte Digests, Linux-amd64, Release und OCI-Revision aller drei Image-Arten sowie das Staging-Buildlabel. Es prüft keine Zertifikatskette und ersetzt weder mTLS-Pub/Sub noch Browser- oder Datenbanktests.

Die statischen Repository-Konfigurationslücken sind damit abgedeckt. Echte Image-Builds, Apache-Gesamtkonfiguration und VHost-Zuordnung am Zielhost, Regression der bestehenden Dienste, Zertifikat-/ACL-Handshake, Migrationen auf leerer DB, Attachment-Rechte, Konten/Fixtures, Shutdown, Backup/Restore und externe Monitoring-/Alarmzustellung bleiben vor Öffnung nachzuweisen. Die vorhandenen Backup-/Monitoring-Vorgaben oben gelten unverändert; keine erfundenen Provider-Variablen ersetzen ihre Einrichtung. Insbesondere Offsite-Ziel, Verschlüsselung, Zeitplanung/Retention und getestete Wiederherstellung sowie Alarmempfänger sind Freigabevoraussetzungen. Kein Deployment, Secret-Erzeugen, Nachrichtenversand oder Hardwareanschluss durch diese Vorbereitung.

## Einmaliger erster Plattformadministrator

Nach vollständig abgeschlossenen Migrationen und geprüftem Staging-Preflight führt der Operator im Migrationsimage explizit `pnpm staging:create-admin --name NAME --email EMAIL --password-stdin` aus. Der Default des Images bleibt `prisma --version`, der externe Compose-Default bleibt `prisma migrate status`; keiner startet den Bootstrap automatisch. Ein neues geprüftes Migrationsimage aus dieser Revision ist erforderlich.

Der Befehl verlangt exakt `METERWERK_ENV=staging` und `DATABASE_URL` mit `postgresql:`, Host `db`, Port `5432`, Datenbank und Benutzer `meterwerk_staging`, ohne Queryparameter oder Fragment. Das ist dieselbe Zielprüfung wie im Compose-Preflight, keine Erkennung anhand eines Namensbestandteils. Die Netzwerk-/DNS-Isolation und Bereitstellung der richtigen Zugangsdaten bleiben Voraussetzung des geprüften Staging-Stacks. Es gibt keinen Override für andere Ziele.

Später auf dem Linux-Operatorhost in **Bash**, nach Definition von `dc` aus dem Runbook und mit bereits laufender Datenbank (hier nur dokumentiert, nicht ausgeführt):

```bash
(
  set +x
  set +a
  set -o pipefail
  export -n admin_password admin_password_confirm
  trap 'unset admin_password admin_password_confirm' EXIT
  read -r -p 'Name: ' admin_name
  read -r -p 'E-Mail: ' admin_email
  IFS= read -r -s -p 'Passwort (14–128 Zeichen): ' admin_password || exit 1
  printf '\n' >&2
  IFS= read -r -s -p 'Passwort wiederholen: ' admin_password_confirm || exit 1
  printf '\n' >&2
  if [[ "$admin_password" != "$admin_password_confirm" ]]; then
    printf '%s\n' 'Passwörter stimmen nicht überein. Bootstrap abgebrochen.' >&2
    exit 1
  fi
  printf '%s' "$admin_password" |
    dc --profile operations run --rm --no-deps -T migrations \
      pnpm staging:create-admin --name "$admin_name" --email "$admin_email" --password-stdin
)
```

Das Passwort wird verdeckt eingegeben und nur über die Pipe übertragen: nicht als Argument, exportierte Umgebungsvariable oder Datei. Keine Shell-Traces aktivieren. stdin muss nach einer einzelnen Passwortzeile geschlossen werden; ein abschließendes LF/CRLF wird entfernt, sonstiger Whitespace bleibt erhalten. Keine Standardzugangsdaten. E-Mail wird getrimmt und kleingeschrieben, Name getrimmt. Erfolg und Fehler enthalten weder Passwort noch Hash oder technische Datenbankdetails; Exitcode ungleich null bedeutet Fehler/Verweigerung.

Die Transaktion sperrt die User-Tabelle gegen gleichzeitige Schreibzugriffe, prüft den gesamten Benutzerbestand und erstellt genau einen aktiven SUPER_ADMIN ohne Mandant sowie einen atomaren `STAGING_ADMIN_BOOTSTRAP`-AuditEvent. Argon2id kommt unverändert aus `src/server/password.ts`. Es entstehen keine Mandanten, Pläne, Subscriptions oder Messdaten. Login und MFA bleiben unverändert; die bestehende MFA-Einrichtung ist anschließend regulär durchzuführen.

**Sobald irgendein Benutzer existiert, funktioniert der Bootstrap absichtlich nicht mehr**, auch bei deaktivierten Benutzern oder einem parallelen/zweiten Aufruf. Keine Passwortänderung und kein Ersatzadministrator über diesen Befehl; weitere Verwaltung erfolgt authentifiziert. Fehlgeschlagener Audit oder Benutzer-Insert rollt die gesamte Transaktion zurück. Für Tests ausschließlich `pnpm exec vitest run tests/staging-admin.test.ts tests/staging-admin-cli.test.ts tests/staging-admin-db.test.ts`: Der DB-Test verwendet einen neuen lokalen Loopback-Cluster auf Port 55449, vollständige versionierte Migrationen und keine externe DATABASE_URL. Der gestoppte Cluster bleibt unter `.local/bootstrap-test-*` zur lokalen Diagnose erhalten.
