# Disaster Recovery

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
