# Externes Staging – Meterwerk v1.0 RC

Stand 2026-10-02. Baseline: `dce9b24958cee9c0ceb5ef9424767177c7dbc9bf`; validierter Code: `0186e076331f34dd10aefd6192c11417f25e2c04`. Lokale Acceptance und Remote-CI sind laut freigegebenem RC-Stand PASSED; Next.js 16.3.8, Dependency Audit 0 Advisories. Historische Audit-Blockaden gelten nicht als aktueller Befund. Diese Prüfung wiederholt keine Software-Acceptance.

**STAGING_DEPLOYMENT_PENDING: JA.** Vorbereitung, kein Deploymentnachweis. Keine Production-Ressourcen, Kundendaten, Hardware, echten Nachrichten oder Abrechnungen verwenden. Keine Ressourcen, Secrets, GitHub Environments oder Tags wurden angelegt. Siehe [Readiness-Bericht](acceptance/STAGING-DEPLOYMENT-READINESS.md).

## Bestand und Lücken

| Bereich    | Vorhanden                                                            | Vor externem Start offen                                                      |
| ---------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Web        | Non-root Standalone-Image, Liveness, OCI-Metadaten                   | Registry-Digest, Proxy/TLS, vollständige Konfiguration                        |
| Worker     | Eigenes Image; Rules, Rollout, MQTT; Signalbehandlung                | Drei überwachte Prozesse, mTLS-Mounts, Restart/Grace                          |
| Compose    | Eigenständige compose.staging.yaml, internes Netz, getrennte Volumes | Geprüfte Infrastruktur-Ergänzung, kein unveränderter Vollstart                |
| PostgreSQL | Version 17, pg_isready, 47 Migrationen                               | Leeres isoliertes Ziel, Migration-Runner, Backup/Restore                      |
| MQTT       | Mosquitto-Image und lokaler Healthcheck                              | Brokerkonfiguration fehlt im Staging-Compose; Worker-Konnektivität unbewiesen |
| Storage    | Privates persistentes Attachment-Volume                              | Non-root-Schreibrechte, Backup, Kapazitätsalarm                               |
| CI         | Tests, Web-/Worker-Build, Runtime-Prüfungen, SBOM                    | Kein Registry-Login/Push oder Deployment                                      |
| Betrieb    | Smoke-Script, Backup-Helfer, Betriebsdokumentation                   | Providerintegration, Alarme, externe Laufzeitnachweise                        |

Staging-Compose ausschließlich eigenständig verwenden, nicht mit compose.yaml, compose.production.yaml oder compose.pilot.yaml kombinieren. Basisdateien haben andere Nutzer, Volumes, Ports und Sicherheitsannahmen. Staging veröffentlicht keine DB-/MQTT-Ports; Web bindet an Host-Loopback:3000. MQTT mountet keine Brokerkonfiguration: ein lokaler Broker-Healthcheck belegt keine Worker-Erreichbarkeit. infra/mosquitto/mosquitto.conf erlaubt anonymen Development-Zugriff und ist ungeeignet. pilot.conf/pilot.acl sind mTLS-Referenzen, benötigen eigene Staging-Zertifikate, CRL und Health-ACLs. Kein Web-Reverse-Proxy oder Web-TLS-Artefakt vorhanden.

## Zielarchitektur

```text
Internet -> HTTPS:443 / Reverse Proxy -> Meterwerk Web:3000
                     |
            privates Staging-Netz
            Web, Rules Worker, Rollout Worker, MQTT Worker
            PostgreSQL db:5432, MQTT mqtt:8883 (mTLS)
            privates persistentes Attachment-Volume
            kurzlebiger Migration-Runner

Backups -> verschlüsselter separater Speicher außerhalb des DB-Volumes
```

Proxy auf dem Host vor Loopback:3000 oder als Container mit Edge-Netz und privatem Backendzugang. Containerproxy verwendet web:3000; DB db:5432; MQTT mqtt:8883. localhost nur für Selbsttests. Öffentlich ausschließlich HTTPS sowie gegebenenfalls HTTP für Redirect/ACME; Administration über eingeschränkten SSH-/VPN-Zugang. Worker, DB, MQTT, Management und MQTT-WebSockets bleiben privat. Nur Web wird öffentlich geroutet.

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

Compose reicht MFA-/Webhook-Schlüssel, Hostkonfiguration und mTLS-Mounts derzeit nicht durch: vor Start ergänzen. .env.example nicht ungeprüft kopieren, insbesondere SEED_DEMO=true entfernen. Lokale .env wurde nicht ausgelesen. Isolation-Guards sind heuristisch und kein Nachweis der Provider-/Kontozugehörigkeit.

## Container und GitHub-Verknüpfung

Commit -> bestehende erfolgreiche CI-Evidenz -> getrennte Linux-amd64-Web-/Worker-Builds -> gewählte Registry -> aufgezeichnete Digests -> manuelle Staging-Promotion. Vorhandene Workflows bauen Images, veröffentlichen sie nicht. Jetzt kein Workflowstart und keine Registryeinrichtung. Tags dienen zur Suche; Deployment per Digest. PostgreSQL, MQTT und Proxy ebenfalls versionieren/pinnen.

Frozen Lockfile vorhanden; mutable node:22-alpine verhindert die Behauptung byteidentischer Rebuilds. Beim späteren Build Basisdigests/Toolchain fixieren oder erfassen, Buildargumente, SBOM, OCI-Revision und Digests archivieren. Der Web-Dockerfile hat kein dediziertes NEXT_PUBLIC_METERWERK_ENV-Buildargument: minimalen Buildkonfigurationsschritt vor Promotion ergänzen und sichtbares Label prüfen. Keine Secrets als Buildargs. Migration-Runner aus derselben Revision separat bereitstellen; Runtimeimages enthalten nicht zugesichert die vollständige Prisma-Administration.

Vorgeschlagene spätere GitHub-Namen, noch nicht implementiert: Environment staging; REGISTRY_HOST, REGISTRY_WEB_REPOSITORY, REGISTRY_WORKER_REPOSITORY, REGISTRY_USERNAME, REGISTRY_PUBLISH_TOKEN, STAGING_SSH_HOST, STAGING_SSH_USER, STAGING_SSH_PRIVATE_KEY, STAGING_SSH_KNOWN_HOSTS. OIDC/kurzlebige Identitäten bevorzugen, sofern unterstützt. Publish-Recht nur für CI, Pull-Recht am Host. App-/DB-Secrets im Staging-Secretstore, keine Production-Rechte. Reviewer, Deployment-Sperre und Artefaktretention später einrichten. Kein grundloser erneuter Remote-CI-Lauf.

## Migration und synthetische Daten

47 Migrationsverzeichnisse bestätigt. Neuer isolierter DB-Zielbestand muss leer sein. Kurzlebiger Runner im privaten Netz benötigt passenden Checkout, Node/pnpm, vollständige eingefrorene Abhängigkeiten, Prisma-CLI, Schema/Migrationen und Baseline-Script. DATABASE_URL sicher injizieren; keine DB-Portfreigabe als Abkürzung.

Sequenziell, jeder Fehler stoppt den Rollout:

```sh
pnpm db:generate
pnpm db:migrate
pnpm exec prisma migrate status
```

Der db:migrate-Befehl prüft read-only Historie/Checksummen und führt prisma migrate deploy aus. Alle 47 Migrationen müssen abgeschlossen sein. Kein migrate dev, db push, reset oder Kaschieren von Checksummen. Web/Worker bleiben bis Erfolg gestoppt.

Demo-Seed verweigert staging und verändert bei Wiederholung unter anderem Pläne/Subscriptions. Deshalb kein Seed im Staging-Start. Sicherer Vorbereitungsweg: einmaliger Seed in neuer isolierter lokaler Development-DB derselben Revision mit explizitem SEED_DEMO und geheim verwaltetem DEMO_PASSWORD; ausschließlich nachweisbar synthetische Daten exportieren. Für frisch migriertes Staging einen geprüften Daten-only-Import verwenden, FK-Reihenfolge/Transaktion beachten. Alternativ vollständigen synthetischen Dump in noch leere DB restaurieren und danach Baseline/Migrationsstatus prüfen; nicht beide Schemawege mischen. Kein Production-Dump, keine Umdeklaration bestehender Staging-DB als development. Individuelle Testzugänge vor Öffnung einrichten, gemeinsame Demo-Zugangsdaten nicht veröffentlichen, Seedvariablen entfernen. Ohne geprüfte Konten/Fixtures bleiben Login-/Tenant-Smokes offen.

## Health, Shutdown und Restart

Web live prüft Prozessantwort; ready prüft SELECT 1 und Secrets nur bei METERWERK_ENV=production. Kein MQTT-/Worker-/Storage-Nachweis. Build-Info ist aktuell unauthentifiziert. PostgreSQL pg_isready durch authentifizierte SQL-/Migrationsprüfung ergänzen. MQTT mit mTLS und freigegebenem Health-Topic sowie synthetischem Pub/Sub aus privatem Netz prüfen; anonymen localhost-$SYS-Check für mTLS ersetzen.

Mindestvorgabe: Web stop_grace_period **30s** gegenüber ca. 11,90s gemessenem bisherigen Drain; Worker und PostgreSQL **60s**, MQTT/Proxy **30s**. Aktive Jobs können länger dauern: im Staging messen und Frist erhöhen; SIGKILL/Exit 137 ist kein erfolgreicher Drain. Proxy aus Routing nehmen, Web drainen, Worker stoppen, Broker/DB zuletzt.

Für Web, drei Worker, DB und MQTT zunächst restart: on-failure:5; im Staging-Compose bislang nicht gesetzt. Host-Neustart über kontrollierten Service-Start mit Preflight absichern. Docker-Retryzähler ist kein dauerhafter Circuit Breaker: bei mehr als fünf Starts in zehn Minuten extern alarmieren und bis Diagnose stoppen. Keine blinde Autoheal-Schleife. Lebender Prozess kann fachlich stillstehen: Heartbeat/Zyklus/Queuefortschritt separat überwachen. Readiness steuert Traffic, nicht allein Restarts.

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

Vorbereiteter Operatorplan, hier nicht ausgeführt. Die nachfolgend genannte compose.staging.external.yaml ist ein **noch zu erstellendes Infrastrukturartefakt** nach Zielentscheidung: Proxy/Netze, mTLS/Health, vollständige Env-/Secret-Mounts, Restart/Grace/Loglimits und gepinnte Images. Kein Start mit fehlender Datei/Voraussetzungen.

1. Provider/Server explizit beauftragen, separate Ressourcen/Backupziel/Administration bereitstellen.
2. Gewählten DNS-Record setzen und Auflösung/Eigentum prüfen.
3. Privates Netz und Volumes, Proxy-Backendzugang und gegebenenfalls kontrollierten Egress definieren.
4. Secrets über Providerstore oder rootgeschützte externe Datei/Mounts hinterlegen. Zielkonten prüfen. Keine Shell-Traces oder Environment-Ausgabe über docker inspect/compose config.
5. Web-/Worker-Images bereitstellen, Digest/Revision/SBOM erfassen; Infrastrukturimages pinnen. Auf Linux Operatorfunktion definieren:

   ```sh
   set -eu
   dc() { docker compose --project-name meterwerk-staging --env-file "$STAGING_ENV_FILE" -f compose.staging.yaml -f compose.staging.external.yaml "$@"; }
   dc config --quiet
   dc pull
   ```

   STAGING_ENV_FILE ist ein sicher injizierter externer Dateipfad. Syntaxcheck ersetzt keine Ziel-/Secretprüfung.

6. `dc up -d --no-deps db`: neue isolierte DB starten.
7. `dc up -d --no-deps mqtt`: privaten mTLS-Broker starten.
8. `dc ps`, selektiven Healthstatus, SQL und mTLS-Pub/Sub prüfen; bei Fehler stoppen.
9. Migration-Runner wie oben ausführen, Exitcode/47 Migrationen bestätigen. Kein Web-/Workerstart bei Fehler.
10. Optional geprüfte synthetische Fixtures importieren; Testzugänge kontrollieren, Seedvariablen entfernen.
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

Provider muss Linux amd64, Container/Compose oder Äquivalent, Web plus drei Worker, PostgreSQL, MQTT/mTLS, persistente Volumes, private Netze, öffentliche HTTPS-Adresse, DNS/TLS-Erneuerung, Secrets, Restartkontrolle, Backups/Restore, Monitoring, Registryzugriff und SSH/gleichwertige Administration ermöglichen. Noch keiner ausgewählt, Funktionen nicht als vorhanden bestätigt.

Offen: STAGING_DEPLOYMENT_PENDING, PITR_FULL_RESTORE_PENDING, HA_FAILOVER_PENDING, REPRESENTATIVE_LOAD_PENDING, HARDWARE_VALIDATION_PENDING.

Benötigte Angaben: Providerpräferenz oder keine Präferenz; gewünschte Staging-Domain, vorhandene Domain JA/NEIN; Monatsbudget inklusive Backup/Registry; Deutschland/EU erforderlich JA/NEIN; vorhandener Server/Registry JA/NEIN; zuständiger DNS-/Adminzugang und gewünschte Testzugangsbeschränkung. Zugangsdaten später sicher hinterlegen, nicht im Chat/Repository.
