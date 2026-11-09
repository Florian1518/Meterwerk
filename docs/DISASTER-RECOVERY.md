# Disaster Recovery

## Scheduled Recovery audit, 2026-11-09

Genuine Scheduled Recovery Evidence remains **PENDING**: no Recovery run with
`event=schedule` was returned by GitHub. The active workflow and unchanged
Monday 07:23 UTC cron are present on the default branch. No recovery checks or
schedule were changed. [API evidence, control-run distinction and next window](acceptance/SCHEDULE-RECOVERY-20261109.md).

## Current WAL acceptance, 2026-11-09

Continuous WAL Offsite operation/monitoring: **PASSED** for three synthetic
incremental cycles against real IONOS storage, run `42595934065`, executed SHA
`ddc8518f006c8c1aa2e152db37524321c098b643`. [Exact evidence and limits](acceptance/WAL-OFFSITE-42595934065.md).
This supersedes historical WAL-pending statements below. Existing Full Restore,
PITR and Host Loss acceptance remains unchanged. IAM Least Privilege and
Staging Recovery remain **BLOCKED**; genuine schedule and operational RPO/RTO
evidence remain pending. No production deployment or operational SLA is claimed.

## Technical RPO/RTO evidence, 2026-11-09

Accepted synthetic Full Restore, PITR and Host Loss timings establish a
conservative technical RTO envelope of **28.613 s**. The synthetic drill's
60-second archive-timeout setting plus the accepted maximum 12.603525-second archive-to-
verified-upload delay yields a **conditional 72.604-second RPO estimate**, not
an observed worst-case RPO: three accepted cycles used manual WAL switches,
and follow-up natural-timeout probes failed closed. The latest instrumented
reproduction showed active committed WAL activity, valid runtime settings, and
an idle checkpointer wait state, but no natural segment switch; the precise
internal checkpointer cause remains undetermined. Technical RTO evidence is
PASSED for the measured synthetic scenarios; technical RPO remains
conditional/pending, and operational/SLA RPO/RTO remains NOT PROVEN. The
detector's 120-second freshness threshold is not a measured alert delay. See
the [acceptance table, run IDs, measurements and limits](acceptance/TECHNICAL-RPO-RTO-20261109.md).

## Host-Loss-Validation: Ergebnis vom 05.11.2026

Der isolierte Host-Loss-Drill bestand im [Workflow-Run 42040140763](https://github.com/Florian1518/Meterwerk/actions/runs/42040140763) auf Kandidaten-SHA `1120e7cfec11ae81374ed0745136138218cf4ae6`. Das Persistence-Gate aus Run `42034092512` war zuvor erfolgreich; der Fortsetzungsrun verifizierte es und übersprang eine Wiederholung. Aus einer leeren isolierten Docker-Umgebung wurden die unveränderlichen Images geladen, ein verschlüsseltes synthetisches Backup ausschließlich aus IONOS Object Storage bezogen, SHA-256 validiert, mit age entschlüsselt, PostgreSQL wiederhergestellt und Restore Verifier sowie App Readiness bestanden. Mosquitto war READY, der MQTT-Worker subscribed und Web/App Readiness war erfolgreich.

Die gemessene Zeit vom Drill-Start bis Restore Verifier und App Readiness beträgt **28,613 Sekunden** (`offsite-host-loss.json`, Evidence-Artefakt `host-loss-apparmor-evidence`, ID `13421845531`). Der Restore-Verifier bestätigte Datenbank-Erreichbarkeit, Schema, Migrationshistorie, Tenant-Integrität, Foreign Keys, keinen Schema-Drift und keine ausstehenden Migrationen. Der Runner-lokale Mosquitto-AppArmor-Override blieb im ENFORCE-Modus; nach dem Drill wurden keine Mosquitto-Denials gefunden und Cleanup bestand.

Dieser Nachweis gilt für die synthetische, leere Docker-Umgebung. OS-Provisionierung und externe Wiederherstellung eines Schlüsselverwahrers waren nicht Teil des Drills; die gemessene Dauer ist kein operatives RTO oder Production-SLA. IAM Least Privilege, freigegebene Staging-Recovery, kontinuierliches WAL-Offsite, echter Scheduled-Cron-Nachweis sowie operatives RPO/RTO bleiben separat offen. Offsite Full Restore `7,471 s` und PITR `8,068 s` sind bestehende Evidence und wurden für diesen Lauf nicht wiederholt.

Historischer Zwischenstand aus `037887db41dfc07c22fb9f03e3b76f3ffab55f54`: Am 04.11.2026 war Host Loss wegen des Mosquitto-Config-Open-Fehlers noch BLOCKED; die Ursache war damals ausdrücklich nicht belegt. Run `42040140763` ist die spätere erfolgreiche Validierung und löst diesen Zwischenstand ab.

## IONOS-Offsite-Acceptance: Ergebnis vom 04.11.2026

Der synthetische Acceptance-Run [41802033425](https://github.com/Florian1518/Meterwerk/actions/runs/41802033425) auf Code-SHA `4e928ed1a96f33db5a28f0f1d3dcdd3b1f530494` bestand. Evidence-Artefakt `offsite-recovery-evidence`, ID `13308157780`, SHA-256 `a34432cfda6e3a2b1dc271fd4191a7c7e24402f3f988f1f092fb11fda2c1dd1c`, Ablauf 04.12.2026. Es enthält nur synthetische Prüfnachweise, keine Dumps, Ciphertexte oder privaten Schlüssel.

IONOS-Endpoint, Bucket-Region, aktiviertes Versioning, deaktiviertes Website Hosting, private ACL und Policy ohne Public Allow wurden geprüft. Alle vier Public Access Block Flags wurden aktiviert und rückgeprüft. Object Storage bestätigte `AES256` bei Upload und HeadObject; Client-Side age blieb aktiv. Kein AWS-KMS wurde verwendet.

Der verschlüsselte Dump und das Manifest wurden unter `phase3-acceptance/41802033425-1/` hochgeladen. Objektversionen: Dump `tTeIRCI760JyWtA8oNe9xHbdjYNJx3G`, Manifest `rKhnay-Ntrxm.wUtzSPJBQKoMsy8XCj`. Lokale Kopien wurden vor Download entfernt. Exakter Download dieser Versionen, Hash, Entschlüsselung, `pg_restore`, Schema-/Migrations-/Tenant-/FK-/Drift- und zentrale Tabellenprüfung sowie App Readiness: PASSED. Restore Verifier: PASSED.

Praktischer Versionsnachweis bestand mit zwei verschiedenen Version-IDs desselben Testobjekts; die frühere Version wurde gezielt wiederhergestellt und gehasht. Fehlendes Objekt, ungültige Version und anonymer Zugriff wurden fail-closed nachgewiesen. Ein absichtlich beschädigter, verschlüsselter Offsite-Download scheiterte am Hash. Die Testobjekte verbleiben verschlüsselt im rungebundenen Prefix; kein DeleteObject war nötig. Retention und autorisierte Bereinigung bleiben Betreiberaufgaben.

Full Restore vom Beginn des externen Downloads bis zum erfolgreichen Restore Verifier und App Readiness: **7,471 Sekunden** (synthetischer Runner). Darin: Download 1,965 s; age-Entschlüsselung 0,011 s; pg_restore 0,934 s; App Start bis Ready 2,257 s; Restore-Verifikation 1,939 s. Die Phasen sind Einzelmessungen; ihre Summe entspricht wegen weiterer Prüf-/Laufzeitanteile nicht zwingend der Gesamtdauer.

Der unveränderte positive PITR-Drill wurde mit externer Base-/WAL-Bundle-Retrieval-Stufe ausgeführt. Deren altersverschlüsseltes Bundle enthielt das Base Backup und WAL; lokale Base-/Archivkopien wurden vor Offsite-Download entfernt. Der Vollbereich der bestehenden Probe-Archivierung war lückenlos: Segmente `000000010000000000000003` und `000000010000000000000004`. Commit-LSN `0/4000190`, Commit-Segment `000000010000000000000004`, Target/Replay-LSN `0/40001F8`, Switch-LSN `0/40002C8`; Commit-Zeit `2026-11-04T08:48:46.266254Z`. Archive wurde nach 99 ms bestätigt. Externer Download bis validiertem PITR-Target: **8,068 Sekunden**; Baseline 1, gewünschter Datensatz 1, späterer Fehler 0. Dies ist nur die synthetische Probe, kein kontinuierliches WAL-Offsite oder betriebliches RPO.

Missing WAL und beschädigtes Base Backup blieben `EXPECTED_FAILURE_CONFIRMED`; Infrastrukturfehler wurden nicht als Erfolg klassifiziert. Testversionen und Offsite-Daten nicht löschen, bis die festgelegte Run-Retention abgelaufen ist.

**Nicht mitbewertete Restpunkte:** Der für diese Akzeptanz verwendete IONOS-Key stammt aus einem Administrator-Kontext. IAM Least Privilege bleibt OPEN/PARTIAL. Spätere Härtung: separater IONOS-User mit ausschließlich „Use Object Storage“, auf Bucket/Backup-Prefix begrenzte Aktionen und negativer Zugriffstest für fremde Prefixe/Buckets; kein Delete-Recht für Restore, danach Admin-Key rotieren. Keine AWS-IAM-/KMS-Semantik behaupten. Keine freigegebene read-only Staging-Backup-Quelle: Staging Recovery BLOCKED. Dauerhafter verschlüsselter WAL-Uploader und Gap-/Lag-Monitoring bleiben offen. Echter Cron-Run: keiner; Workflow active, erster erwarteter Termin 09.11.2026 07:23 UTC. Schedule- und manuelle Dispatch-Evidence nicht verwechseln. RPO aus einem einzelnen synthetischen Backup nicht ableitbar. Host-Loss ist getrennt zu bewerten.

## IONOS Offsite Acceptance (04.11.2026)

Der Betreiber hat den nicht-produktiven Bucket `meterwerk-offsite-backup-fesch`
in `eu-central-3` am Endpoint `https://s3.eu-central-3.ionoscloud.com`
freigegeben. Die bisherigen AWS-KMS-Anforderungen gelten f?r diesen Pfad nicht:
Client-side **age ist zwingend**, zus?tzlich wird **SSE-S3 / AES256** bei Upload
verlangt und bei HeadObject und Download gepr?ft. Der generische Backup-Helfer
beh?lt AWS-KMS als bisherigen Default; `METERWERK_BACKUP_S3_SSE=AES256` w?hlt
SSE-S3 ausdr?cklich. Endpoint-Konfiguration erfolgt ?ber den AWS-CLI-Provider,
kein Credential-File und kein `aws configure`.

Der separate Workflow `offsite-recovery.yml` verwendet GitHub-Secrets ausschlie?lich
als tempor?re Prozessvariablen. Private-Bucket-Pr?fung erfolgt vor Upload:
Region, Versioning, Website deaktiviert, ACL, Policy und Public-Access-Status.
?ffentliche Allow-Principals (auch konditional) und unbekannte ACL-Formen werden
abgewiesen. Unterst?tztes Public Access Block wird auf alle vier Sperren gesetzt;
API- und Infrastrukturfehler werden nicht als Negativtest-Erfolg akzeptiert.

Testobjekte liegen ausschlie?lich unter `phase3-acceptance/<run-id>-<attempt>/`.
Ciphertext und Manifest werden mit konkreten Version-IDs wieder abgerufen;
Hash und Gr??e werden gegen vor dem L?schen festgehaltene Werte gepr?ft.
Vor Retrieval werden lokale Ausgangskopien entfernt. Der separate synthetische
Versionierungsprobe enth?lt keine DB-Daten. Alle Testversionen bleiben erhalten;
keine Remote-L?schung. Betreiber muss Lifecycle/Retention und sp?tere berechtigte
Bereinigung festlegen. CI-Artefakte enthalten nur begrenzte Evidence, keine Dumps,
Ciphertexte oder privaten age-Identit?ten.

WAL/Base-Backup werden im expliziten Offsite-Drill als age-verschl?sseltes,
hashgebundenes Archiv ?bertragen. Segmentnamen bleiben erhalten. Erst nach
Entfernung der lokalen Archiv-/Base-Kopien und externem Abruf laufen die
unver?nderten Target-, Missing-WAL- und Incomplete-Base-Pr?fungen. Dies validiert
einen abgegrenzten WAL-Bereich, keinen dauerhaften WAL-Uploader oder 5-Minuten-RPO.
PITR-Zeit umfasst die synthetische PostgreSQL-Probe; vollst?ndige App-Readiness
geh?rt zum separaten Full-Restore-Gate. Kein Production-SLA-Nachweis.

**Least Privilege bleibt OPEN:** Der aktuelle Schl?ssel stammt laut Betreiber aus
einem Administrator-Kontext. Ziel ist ein separater IONOS-User ohne Adminrolle,
Gruppe nur mit ?Use Object Storage?, getestete Bucket-/Prefix-Policy mit
`PutObject`, `GetObject`, `GetObjectVersion`, `GetBucketVersioning` und nur
ben?tigtem prefixbeschr?nktem `ListBucket`. Sicherheitsinventur ben?tigt zus?tzlich
Read-Rechte f?r Location, ACL, Policy, Website und Public Access Block; dessen
?nderung sollte langfristig ein separater Betreiber ?bernehmen. Kein Delete-Recht
f?r den Acceptance-Pfad. Eine Allow-Policy allein beweist nicht, dass anderweitige
Adminrechte entfallen: Negativzugriff auf fremde Prefixe/Buckets separat abnehmen,
anschlie?end Administrator-Schl?ssel rotieren/entfernen. Keine Policy automatisch
erzeugen und keine AWS-IAM-/KMS-Semantik f?r IONOS behaupten.

Quellen: [IONOS Service Catalog](https://docs.ionos.com/cloud/support/general-information/service-catalog),
[IONOS Storage Security](https://docs.ionos.com/cloud/security-safeguards/best-practice-guideline/best-practice-cloud-storage-products).

Staging bleibt BLOCKED: keine freigegebene read-only Backup-Quelle. Echte
Offsite-Ergebnisse werden erst nach dem Workflow als PASSED dokumentiert.
Die folgenden fr?heren Inventare sind historische St?nde vor Bereitstellung.

## Scope and current evidence

This runbook covers PostgreSQL, application release/configuration, workers,
MQTT configuration, private object storage, and credential recovery. It is a
software procedure, not authorization to access Production or physical meters.
Production data and credentials are not used by CI recovery tests.

The repository provides an encrypted logical-backup command, a digest/manifest
verifier, an isolated restore command, an application/schema restore verifier,
and synthetic full-restore/PITR drills. The weekly GitHub workflow exercises
synthetic CI data only. It does not read a live Staging or Production backup.
No Production provider, bucket, KMS key, WAL archive, or credential is configured
by this phase. Production recovery remains blocked until the external operator
provisions and accepts those resources.

## Operative Evidence vom 03.11.2026

Code-Kandidat `21e196762c18bc8ad7b3425a2b49652a0de43acc` wurde mit
[PR #4](https://github.com/Florian1518/Meterwerk/pull/4) integriert;
Integrations-master ist `43cee3416778f172fbfd2f05c88bbd491ac5a070`.
[Master-CI 41638394904](https://github.com/Florian1518/Meterwerk/actions/runs/41638394904)
und der manuelle
[Recovery-Dispatch 41638539926](https://github.com/Florian1518/Meterwerk/actions/runs/41638539926)
sind vollständig PASSED. Der Workflow ist auf dem Default-Branch master aktiv.
Schedule: `23 7 * * 1`; nächster Solltermin nach dieser Prüfung:
09.11.2026 07:23 UTC / 08:23 Europe/Berlin. Der erste tatsächliche Cron-Lauf
liegt noch in der Zukunft.

Artefakt `synthetic-recovery-evidence` (ID `13231319316`, 30 Tage Retention):
`recovery-evidence.json`, `host-loss-evidence.json`, verschlüsseltes
Backup-Manifest und `meterwerk-pitr-evidence/{archive,positive-pitr,missing-wal,incomplete-base}.json`.
Backup und private Schlüssel sind nicht enthalten. Nach Download wurde die
Evidence erneut geprüft:

```sh
node scripts/verify-recovery-evidence.mjs \
  <artifact>/recovery-evidence.json \
  <artifact>/host-loss-evidence.json \
  <artifact>/meterwerk-pitr-evidence
```

Der positive PITR-Lauf dokumentiert den Commit am
`2026-11-03T12:48:49.581701Z`, Commit-LSN `0/4000190`, Switch-LSN `0/40002C8`,
benötigte Segmente `000000010000000000000003` und `000000010000000000000004`,
Target-/Replay-LSN `0/40001F8` sowie Baseline 1 / gewünschter Datensatz 1 /
späterer Fehler 0. Archive-Wait: tatsächlich gemessene **78 ms**,
`ARCHIVE_CONFIRMED`; **keine Full-Restore-, PITR- oder Host-Loss-RTO-Messung**.
Beide Negativtests ergeben `EXPECTED_FAILURE_CONFIRMED`. Der separate vollständige
Anwendungs-Restore-Verifier bestätigt unter anderem Migration
`202610260001_saas_pricing`, Drift NONE, Tenant-/FK-Prüfung und App-Readiness.

Offsite, Staging-Recovery-Acceptance und betriebliche RPO/RTO bleiben offen.
Es wurden weder eine echte Staging-DB verändert noch Production oder Hardware
verwendet. Details und Statusgrenzen stehen in `SOFTWARE-READINESS-RC7.md`.

## Recovery targets

These are proposed engineering objectives, not an SLA or measured guarantee.
The applicable target must be reviewed against host capacity, database size,
legal retention, and provider limits before use.

| Scenario                         |                    Objective RPO | Objective RTO | Conditions / current limit                                                                                                                      |
| -------------------------------- | -------------------------------: | ------------: | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Accidental row/data deletion     |                            5 min |           4 h | Requires a current base backup and WAL archive with no more than 5 min lag; not configured for Production.                                      |
| Failed/incompatible migration    |                            5 min |           4 h | Fix forward first when safe; otherwise restore/PITR to a new isolated DB, validate, then operator-approved cutover.                             |
| Database corruption              |                            5 min |           4 h | Requires verified base backup, archived WAL, independent storage and a tested clean PostgreSQL host.                                            |
| Complete host loss               | 24 h without WAL; 5 min with WAL |           4 h | Daily offsite full backup is the fallback. Reprovisioning, external secrets, DNS/TLS, and object storage affect RTO.                            |
| Compromised instance             |                Incident-specific |    8 h target | Isolate and rotate credentials first; select a backup predating compromise. Attacker dwell time may make the data-loss window much larger.      |
| Defective application deployment |       0 min if schema compatible |        30 min | Redeploy previously verified immutable image digests. Database rollback is never implicit; incompatible migrations use the migration procedure. |

The five-minute PITR target requires WAL archival at least every five minutes,
continuous monitoring of archive lag, and retention covering the incident
detection window. Without a verified archive, the honest fallback is the last
verified full backup: up to 24 hours of data loss for a daily schedule. RTO is
measured from incident declaration through all restore checks; estimates alone
do not count as a passed drill.

## Backup model and ownership

| Control         | Required setting                                                                                                                                                                                                                        | Owner / evidence                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Logical backup  | PostgreSQL custom-format `pg_dump`, daily at 02:00 UTC; additionally before schema-changing operations                                                                                                                                  | Platform operator; timestamped encrypted file and manifest                                                                              |
| PITR source     | PostgreSQL physical base backup plus continuous WAL archive, target archive lag <= 5 min                                                                                                                                                | Database operator; provider metrics and successful PITR evidence                                                                        |
| Offsite         | Dedicated private, versioned S3 bucket in a separate account/region; prefix `meterwerk-backups/`; independent credentials/role                                                                                                          | Storage operator; object version and server-side encryption check                                                                       |
| Encryption      | Client-side `age` X25519 recipient encryption before upload; S3 SSE-KMS in transit/offsite                                                                                                                                              | Security owner; public recipient in deployment config, private identity escrowed in external secret manager and offline recovery escrow |
| Retention       | 35 daily copies and 12 month-end copies as a starting policy; apply legal/contractual limits and holds before enabling deletion                                                                                                         | Data owner; bucket lifecycle configuration reviewed; newest verified backup protected                                                   |
| Integrity       | SHA-256 of encrypted bytes, size and format; manifest contains DB name, PostgreSQL server/tool versions, migration version, source SHA, UTC timestamp and backup type; verify before restore and compare remote object size/version/KMS | Backup job and restore verifier; secret-free JSON evidence                                                                              |
| Restore testing | Weekly isolated synthetic DB restore and PITR in CI; monthly restore of the newest offsite copy into isolated TEST after a provider is configured                                                                                       | Platform operator; evidence report and run ID                                                                                           |

Use `pnpm db:backup backup <unique-file.age>` with `DATABASE_URL`, the full
40-character `GIT_COMMIT_SHA`, `METERWERK_BACKUP_AGE_RECIPIENT`, and installed
`pg_dump`, `age`, and (for offsite) `aws` CLI. `METERWERK_BACKUP_AGE_RECIPIENT`
is public key material; the matching private identity is supplied only by a
secret manager as `METERWERK_BACKUP_AGE_IDENTITY_FILE`. Do not put private
identities, database URLs, cloud credentials, or plaintext dumps in the
repository, a workflow artifact, or logs. The tool streams dump/encryption,
uses restrictive file permissions and temporary files, writes the manifest
atomically, and removes plaintext on completion.

For an independent offsite copy, set `METERWERK_BACKUP_S3_URI` to a dedicated
private bucket prefix and `METERWERK_BACKUP_S3_KMS_KEY_ID` to an approved
customer-managed KMS key/alias. The CLI uses the AWS external credential provider
(instance role/OIDC; never a credential argument), requests SSE-KMS, uploads
the encrypted object and manifest, then requires a version ID, matching size,
and `aws:kms` with the same KMS key reference from `head-object`. Configure bucket versioning, deny public
access, cross-account/region replication, KMS key policy, retention/lifecycle,
and object lock where approved. The application intentionally has no
Production credentials or bucket defaults. Missing offsite configuration does
not silently claim an offsite backup.

## Isolated full restore and verification

1. Declare the incident, record UTC time, source SHA, target RPO/RTO, and
   authorize a recovery operator.
2. Provision a clean, isolated PostgreSQL target. In tests set
   `METERWERK_ENV=test`, `DATABASE_URL` to that target and use only a new
   `meterwerk_restore_*` database name.
3. Obtain the decryption identity from the authorized secret manager; verify
   the manifest, ciphertext size/SHA-256, age decryption, PostgreSQL custom
   archive header, and `pg_restore --list`.
4. Restore into the newly created empty database with `pg_restore` in a single
   transaction. The tool rejects any target name outside the restore prefix;
   it never drops or overwrites a database.
5. Run `pnpm db:restore:verify` with `PGDATABASE`, `DATABASE_URL`,
   `METERWERK_ENV=test`, `METERWERK_BACKUP_MANIFEST`, and
   `METERWERK_RESTORE_READY_URL`. The gate requires database reachability,
   core tables, successful Prisma migration history matching the manifest,
   tenant data and a validated composite tenant foreign key, all foreign keys
   validated, a clean Prisma schema diff/no pending migrations and a healthy
   application readiness endpoint. Missing evidence is failure.
6. Compare tenant-scoped row counts and sampled business invariants against
   known source evidence without exporting customer data. Reconcile referenced
   object-storage versions and hashes. A database-only success is not a
   full-service recovery.
7. Save only secret-free manifest, check results, UTC timings, tool versions,
   source/image digests and the run URL as recovery evidence. Never upload the
   database dump, decrypted data or identity file as a CI artifact.

The application should be started from the verified immutable Web and Worker
image digests belonging to the accepted release. The migration image digest
must be from the same release. Do not rebuild or substitute a mutable tag as a
recovery image. Keep Compose/deployment definitions, reverse-proxy routing,
MQTT config/ACL/CA references, and recovery scripts versioned. CI exercises
the Web readiness check against the restored synthetic database; external
Worker/MQTT/TLS/DNS restoration remains an operator acceptance step.

## Point-in-time recovery

Production PITR requires a PostgreSQL base backup, continuous WAL archiving to
independent encrypted storage, a monitored archive command, restore command,
retention, and a trusted UTC target. None is configured for Production by this
phase. The automated `scripts/pitr-drill.sh` creates an isolated PostgreSQL 17
instance with a synthetic baseline, enables WAL archiving, takes a physical
base backup, commits a desired record, creates a named WAL restore point with
an exact recorded LSN, and commits a synthetic error afterwards. A separate
post-commit WAL switch and confirmed archive precede recovery. The drill
restores to the named target and asserts that baseline data is present and the
post-target error is absent. This proves the PostgreSQL mechanism in CI, not
Production archive availability or an achieved RPO.

For an incident, restore the base backup into a clean host, configure
`restore_command`, `recovery.signal`, and `recovery_target_time` (or a reviewed
LSN), start recovery without public traffic, wait for promotion, validate
schema/data/object references, and only then request operator approval for
endpoint cutover. Preserve source/WAL evidence read-only.

## Migration failure: fix forward or restore

First stop retries and preserve logs/backup/WAL. Check whether the migration
transaction rolled back, inspect `_prisma_migrations`, and determine whether
the running application and new schema are backward compatible. Prefer a
tested forward fix when data changes are valid and repairable. Restore/PITR is
required if integrity is uncertain, the migration is destructive, or the
application cannot safely run against the resulting schema. Restore to a new
isolated database and verify there; never attempt an in-place database
rollback or edit a historical migration. The CI drill injects a failure in a
disposable database, verifies transaction rollback, and restores the known
good synthetic backup into another new DB.

## Host loss, configuration and credentials

1. Isolate/revoke the lost host and its workload roles. Do not reconnect an
   untrusted host to live services.
2. Provision a clean host/cluster from the versioned Compose and operational
   configuration. Restore DB and private objects from independently stored,
   verified versions.
3. Pull only accepted immutable Web/Worker/Migration image digests and verify
   release signatures/provenance from Phase 2 evidence.
4. Reissue secrets from their authorized external source: database role,
   session/MFA encryption, webhook encryption, object-storage role, MQTT CA
   and client/server certificates/keys, mail/push provider, signing/deploy
   identity. Rotate credentials after compromise; invalidate sessions,
   tokens and certificates. The backup manifest contains references/metadata
   only, never secret values.
5. Restore reverse proxy/DNS/TLS from managed configuration; verify hostnames,
   issuer/expiry, forwarding headers and firewall rules before enabling traffic.
6. Start PostgreSQL, migrations only as an explicit reviewed operation,
   object storage, MQTT, Web and Workers. Wait for database and application
   readiness; verify tenant isolation, queues, MQTT health, object hashes,
   audit trail and a synthetic transaction. Keep device connections disabled;
   no physical hardware is required for software recovery.
7. Record incident timeline, selected backup/WAL point, measured data loss,
   elapsed recovery time, evidence links, deviations and follow-up actions.

Required but not backed up as secret values: Compose and proxy configuration,
DNS zone/registrar references, certificate issuance configuration, MQTT
configuration/ACL and certificate identifiers, immutable release digests,
DB schema/migration history, object-storage bucket/version references,
retention and alert routes. Secrets must be re-provisioned from the designated
secret manager / cloud IAM, with separately escrowed age identity. If that
source is unavailable, stop recovery and escalate; do not use a local `.env`
or a copied credential archive.

## Scenarios, escalation and evidence

| Event                  | Response                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Accidental deletion    | Preserve audit/time evidence; PITR to a separate target immediately before the change; selectively validate before any approved cutover.    |
| Failed migration       | Stop rollout and migration retries; inspect migration record and transaction state; fix forward or restore per the procedure above.         |
| Corrupt DB / lost host | Isolate source; restore latest verified base+WAL to a clean host; validate the full service before traffic.                                 |
| Compromised instance   | Isolate, revoke role/session/certificates, rotate keys from clean systems, select a pre-compromise backup and inspect audit history.        |
| Failed deployment      | Roll back to prior verified image digests only if schema compatibility is proven; otherwise keep traffic stopped and recover DB separately. |

Escalate any missing/offline backup, hash or decryption failure, WAL gap,
unexplained migration, tenant/FK inconsistency, secret-store outage, or missed
RPO/RTO to the platform/security owner and incident lead. Two-person review is
required before external endpoint cutover or restoring customer data. Evidence
must include manifest hash, object version/KMS state, release digest and
signature verification, migration state, restore checks, sanitized timing,
operator approvals and incident reference. Retain evidence under the approved
security/audit retention policy; do not put customer data or secrets in CI.

## Fail-closed PITR-Negativtests

Der synthetische Drill in `scripts/pitr-drill.sh` verweigert gezielt ein nach dem
Base Backup erzeugtes WAL-Segment. Das Segment liegt nicht im mitgelieferten
Base-WAL. Ein positiver Kontroll-Restore muss den vor dem Recovery-Ziel
geschriebenen `target-marker` enthalten und den späteren Fehler ausschließen.
Der Negativtest benötigt die konkrete Segment-Anforderung, den eigenen
`METERWERK_EXPECTED_MISSING_WAL`-Sentinel und einen nicht erfolgreich beendeten
Recovery-Zustand. Containerstopp oder Timeout allein reichen nicht.

Das unveränderte Base Backup muss zuerst `pg_verifybackup` bestehen. Nur in
einer Kopie wird die im Manifest nachgewiesene Datei `global/pg_control`
entfernt. Der Negativtest akzeptiert ausschließlich den zugehörigen
Manifest-Fehler von `pg_verifybackup`, keinen beliebigen Prozessfehler.

Die Ergebniszustände sind `EXPECTED_FAILURE_CONFIRMED` (Exit 0),
`UNEXPECTED_FAILURE` (Exit 1), `UNEXPECTED_SUCCESS` (Exit 2) und
`INFRASTRUCTURE_FAILURE` (Exit 3). Nur der erste Zustand besteht den Negativtest.
`node --test tests/recovery-negative-result.test.mjs` prüft die Klassifikation;
der reale Docker-/PostgreSQL-Drill bleibt ein zusätzliches erforderliches Gate.

Die begrenzte synthetische Evidence liegt unter
`$RUNNER_TEMP/meterwerk-pitr-evidence/{missing-wal,incomplete-base}.json`.
Sie enthält Segment, Restore-Sentinel, Container-/Recovery-Zustand bzw.
entfernte Datei, Verifier-Ausführung und Exit-Code. Der Evidence-Verifier
berechnet die Klassifikation erneut. Ein grüner synthetischer Drill belegt
weder einen externen Offsite-Pfad noch Staging-Acceptance oder Production-RPO.

## Deterministische positive PITR-Kontrolle

Alle INSERT-Transaktionen beenden ihren eigenen `psql`-Aufruf erfolgreich,
bevor der nächste Schritt beginnt. `track_commit_timestamp=on` liefert den
tatsächlichen Commit-Zeitpunkt; `pg_current_wal_lsn()` und `pg_walfile_name()`
werden anschließend erfasst. Der benannte Restore-Punkt
`meterwerk_before_error` liegt nach dem gewünschten Commit und vor der
Fehlertransaktion; seine LSN wird ebenfalls gespeichert. Der WAL-Switch erfolgt
erst nach dem separaten Commit der Fehlertransaktion.

`scripts/pitr-archive.mjs` berechnet anhand des Base-Backup-Manifests und der
PostgreSQL-Segmentgröße alle Segmente bis zur beobachteten Post-Error-Commit-LSN.
Der Poll prüft alle 250 ms, maximal 30 Sekunden lang, Archivdateien und
`pg_stat_archiver`. Nur vollständige Segmente, fortgeschrittener Archiver-Zähler,
passende `last_archived_wal` und unveränderter Fehlerzähler ergeben
`ARCHIVE_CONFIRMED`. Switch-Fehler, fehlende Segmente, Archiver-Fehler und Timeout
sind Fehlerzustände. Ein Sleep erzeugt weder den Recovery-Zielpunkt noch Erfolg.

`archive.json` und `positive-pitr.json` im PITR-Evidence-Verzeichnis dokumentieren
Commit-Zeit/LSN/Segment, Switch-LSN, erforderliche und vorhandene Segmente,
Archiver-Bestätigung, Restore-Punkt/LSN, Replay-LSN und Datenprüfungen. Promotion
allein reicht nicht: Replay muss den Zielpunkt erreicht haben; Baseline und
gewünschter Datensatz müssen vorhanden sein, der spätere Fehler muss fehlen.
Zusätzlich werden Constraint-Status und Dump-Lesbarkeit geprüft. Der vollständige
Anwendungs-Restore-Verifier und App-Readiness bleiben separate Pflicht-Gates im
gleichen Workflow auf der wiederhergestellten Anwendungsdatenbank. Die kleine
PITR-Probedatenbank enthält keine Anwendungstabellen.

## Externer Test-Offsite-Pfad: erforderliche Freigabe

Am 03.11.2026 wurde kein autorisierter nicht-produktiver Offsite-Pfad
nachgewiesen. GitHub meldete keine Environments und keine Repository-Variablen;
`METERWERK_BACKUP_S3_URI`, `METERWERK_BACKUP_S3_KMS_KEY_ID`, `AWS_REGION` und
`AWS_DEFAULT_REGION` waren in der verfügbaren lokalen Prozessumgebung nicht
gesetzt. Das ist keine Aussage über unbekannte Cloud-Ressourcen. Es wurden
keine Production-Credentials gesucht und keine Cloud-Ressourcen angelegt.

Für den nächsten Acceptance-Drill muss der verantwortliche Betreiber bereitstellen:

| Konfiguration   | Minimal erforderlich                                                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bucket / Prefix | Explizit als TEST/STAGING freigegebener privater Bucket mit dediziertem `s3://<bucket>/meterwerk-backups/<test-prefix>`; Eigentümer und erlaubte Testobjekte benennen.                                                              |
| Region          | Tatsächliche Bucket-Region als `AWS_REGION`; regionale KMS-Key-Zuordnung bestätigen.                                                                                                                                                |
| Versioning      | Bucket-Versioning `Enabled`; sowohl Ciphertext als auch Manifest müssen eine echte Version-ID erhalten.                                                                                                                             |
| KMS             | Aktivierter symmetrischer SSE-KMS-Key im autorisierten Testkontext; ARN oder Alias über `METERWERK_BACKUP_S3_KMS_KEY_ID`; Key-Policy erlaubt nur die freigegebene Rolle.                                                            |
| IAM Principal   | Explizit freigegebene Test-/Staging-Rolle, vorzugsweise kurzlebige OIDC-/STS-Sitzung, mit dokumentierter Trust-Policy und unabhängig vom ursprünglichen Backup-Host nutzbar. Keine persönlichen oder Production-Zugangsdaten.       |
| Bucket-Rechte   | `s3:GetBucketVersioning`; für prefixbeschränkte Inventur und Versionsbereinigung `s3:ListBucket` und `s3:ListBucketVersions`.                                                                                                       |
| Objekt-Rechte   | Auf den Testprefix beschränkt: `s3:PutObject`, `s3:GetObject`, `s3:GetObjectVersion`; bei Multipart-Uploads zusätzlich `s3:AbortMultipartUpload` und `s3:ListMultipartUploadParts`.                                                 |
| KMS-Rechte      | Auf den konkreten Key beschränkt: `kms:DescribeKey`, `kms:GenerateDataKey`, `kms:Decrypt`. S3-Zugriff auf den vorgesehenen Bucket/Region-Kontext einschränken; keine KMS-Administration erforderlich.                               |
| Testbereinigung | Explizite Retention-/Cleanup-Policy. `s3:DeleteObjectVersion` nur für synthetische Testobjekte und deren Manifest-Versionen; `s3:DeleteObject` nur, falls die genehmigte Policy dies zusätzlich benötigt. Keine Bucket-Löschrechte. |
| age / Staging   | Freigegebener öffentlicher age-Empfänger und separat zugängliche private Identität für den Restore. Erst anschließend freigegebene read-only Staging-Backup-Quelle bereitstellen; Restore ausschließlich lokal isoliert.            |

Ohne diese konkrete Zuordnung endet die operative Arbeit nach Master-Integration,
CI und Schedule-/Dispatch-Nachweis. Kein improvisiertes S3-Ziel und keine
kostenpflichtige Provisionierung. Der nächste Drill muss Upload, Version-ID,
SSE-KMS-Key, Entfernung der lokalen Ausgangskopie, ausschließlich externen
Download, Hash, Entschlüsselung und vollständigen Restore nachweisen.

## WAL-Betriebsfähigkeit und Messgrenzen

| Bestandteil                                 | Nachgewiesene Softwarefähigkeit / offene Betriebsabhängigkeit                                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archive_mode`, WAL-Switch, Target-Recovery | PostgreSQL-17-Drill mit `archive_mode=on`, getrenntem Commit/Switch und benanntem Restore-Punkt samt LSN.                                                                                                                                           |
| WAL-Shipping                                | Der Drill kopiert WAL in ein isoliertes lokales Archiv. Ein kontinuierlicher externer Uploader ist damit nicht abgenommen.                                                                                                                          |
| WAL-Verschlüsselung / Offsite               | age und SSE-KMS sind für den logischen Backup-Pfad implementiert. Kontinuierliche verschlüsselte WAL-Offsite-Übertragung bleibt extern zu implementieren und abzunehmen.                                                                            |
| Retention                                   | Zielwerte sind dokumentiert; ein realer WAL-/Base-Backup-Lifecycle ist nicht konfiguriert oder nachgewiesen.                                                                                                                                        |
| Monitoring / Gap Detection                  | Der Drill prüft `pg_stat_archiver` und die vollständige benötigte Segmentmenge. Das ersetzt keine kontinuierliche Upload-/Lag-Überwachung, Alarmierung oder betriebliche Gap Detection.                                                             |
| RPO / RTO                                   | Synthetische PITR-Korrektheit ist belegt. End-to-End-Retrieval-, Entschlüsselungs-, Restore-, App-/Worker-Start- und Readiness-Zeiten sind noch nicht als Betriebsdrill gemessen. Die Ziele 24 h / 5 min RPO und 4 h / 8 h RTO bleiben unvalidiert. |

Ein gemessener Archive-Wait oder die Dauer eines CI-Jobs ist keine vollständige
RTO-Messung. Kein synthetischer Run belegt eine reale Production-RPO.

## Operative Fortsetzung: Inventar vom 04.11.2026

Read-only geprüft wurden Repository-/CI-/Staging-Unterlagen, die Namen der
GitHub-Konfiguration und die relevanten lokalen Prozessvariablen. GitHub meldet
0 Environments, 0 Repository-Variablen und 0 Repository-Secrets. Backup-S3-URI,
KMS-Key, AWS-Region, AWS-Rolle und Endpoint sind lokal nicht gesetzt. Die
Staging-Unterlagen nennen Vorlagen und optionalen Attachment-Speicher, jedoch
keinen freigegebenen Offsite-Testpfad oder read-only Backup-Principal. Die
CI-S3-/KMS-Ziele sind Fehler-Testdoubles, keine externen Ressourcen. Unbekannte
Cloud-Ressourcen wurden nicht untersucht; kein Host oder Cloudkonto kontaktiert.

**OFFSITE REQUIRED:** Betreiber muss Provider, privaten Test-Bucket und Prefix,
Region/Endpoint, aktiviertes Versioning, regionalen SSE-KMS-Key sowie eine
dedizierte IAM-/OIDC-Testrolle mit Trust-Policy benennen. Der vorhandene
Backup-Adapter verwendet AWS CLI und AWS KMS; bloße S3-Kompatibilität eines
anderen Providers belegt keine KMS-Kompatibilität. Öffentlichen age-Empfänger
und sichere separate Schlüsselbereitstellung festlegen; keine Secrets im Chat.

Minimalpolicy: `s3:PutObject`, `s3:GetObject`, `s3:GetObjectVersion` auf den
Testprefix; `s3:GetBucketVersioning` auf den Bucket. `s3:ListBucket` nur für
benötigte Inventur, mit Prefix-Bedingung. `kms:DescribeKey`,
`kms:GenerateDataKey` und `kms:Decrypt` nur auf den Test-Key. `kms:Encrypt`
nur bei zusätzlich eingesetztem direktem KMS-Encrypt-Aufruf; der vorhandene
SSE-KMS-Upload verwendet keinen solchen Aufruf. Multipart-Rechte nur soweit
für die tatsächliche Uploadgröße erforderlich. Keine Administrationsrechte.
`s3:DeleteObject` und `s3:DeleteObjectVersion` sind für Upload/Restore-Acceptance
nicht erforderlich; Bereinigung separat über Betreiber-Retention oder eine
explizit freigegebene, auf Testversionen begrenzte Cleanup-Policy regeln.

**STAGING REQUIRED:** Freigabe für konsistentes read-only Backup, benannter
Quellhost/Endpoint und Datenbank, dedizierter Backup-Principal, Credential-Art
und sichere Bereitstellung außerhalb des Chats, erlaubter Netzwerkpfad und
gegebenenfalls Zeitfenster. Zusätzlich Datenumfang, Aufbewahrung und Löschung
der isolierten Kopie festlegen. Ein bekannter Staging-Webhost ist keine
Freigabe eines DB-Backup-Zugangs. Kein Restore nach Staging.

Ohne diese Angaben bleiben externer Upload/Restore, Staging-Acceptance und
operative RPO/RTO blockiert. Full Restore, PITR und Host Loss haben keine
End-to-End-Messreihe mit Start, Ende, Teilschritten und Readiness. Die Ziele
24 h / 5 min RPO und 4 h / 8 h RTO sind **NOT YET DEMONSTRATED**;
synthetische Recovery-Korrektheit ist **TECHNICALLY DEMONSTRATED**, externe
Betriebsabnahme nicht **OPERATIVELY DEMONSTRATED**. Kontinuierliches WAL-Offsite
bleibt auch softwareseitig unvollständig belegt; der lokale Archiv-Drill allein
rechtfertigt dafür kein DONE.

## WAL monitoring continuation, 2026-11-09

Continuous WAL Offsite is **PASSED** within the synthetic real-IONOS scope above.
The incremental encrypted worker, fail-closed watchdog and synthetic CI drill
are described in [WAL Offsite Monitoring](WAL-OFFSITE-MONITORING.md).
Existing accepted restore/PITR/Host-Loss evidence below is preserved.
IAM Least Privilege is **BLOCKED** on the real IONOS ContractUserId; no policy
or credential changes are authorized. Staging Recovery remains **BLOCKED**.
