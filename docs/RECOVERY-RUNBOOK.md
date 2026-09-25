# Recovery Runbook

Für alle Fälle gilt: erkennen → eindämmen → Backup auswählen → isoliertes
Restore-Ziel vorbereiten → wiederherstellen → validieren → Dienste starten →
Readiness prüfen → Audit und Timeline dokumentieren. Keine destruktiven
Befehle ohne explizite Zielprüfung; keine Produktionsdatenbank zurücksetzen.

| Fall                           | Erkennen / Eindämmen                                             | Wiederherstellen / Validieren                                            |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Datenbank komplett ausgefallen | Readiness/DB-Alert bestätigen, Writes kontrolliert pausieren     | neue isolierte Instanz, Base+WAL/PITR, FK/Tenant/Readiness prüfen        |
| Datenbank beschädigt           | Checksum-/Integrity-Fehler sichern, betroffene Writes stoppen    | letzten validierten Backup-Stand wählen, Stichproben und Audit prüfen    |
| Versehentliche Datenänderung   | AuditEvent und Zeitpunkt bestimmen, betroffenen Tenant isolieren | PITR-Kopie in Testziel, fachliche Korrektur nach Freigabe                |
| Storage ausgefallen            | Provider-/Bucket-Health prüfen, Uploads quarantänisieren         | private Replik/Version wählen, Hash/Tenant/DB-Referenzen abgleichen      |
| Server verloren                | Deployment-/Secret-Referenzen sichern, alte Instanz sperren      | neue Instanz, Migrationen, Secrets aus Secret Store, Readiness/Worker    |
| Fehlerhaftes Deployment        | Build/Health/Fehlerkorrelation prüfen, Rollout stoppen           | vorherigen geprüften Commit deployen, DB-Migration-Kompatibilität prüfen |
| Worker ausgefallen             | Queue-/Lease-Metriken prüfen                                     | neuen Worker starten, abgelaufene Leases und Idempotency auswerten       |
| Secrets neu bereitstellen      | Secret-Store-Zugriff prüfen, betroffene Zugänge widerrufen       | rotieren, Sessions/Webhooks/API-/Device-Keys kontrolliert erneuern       |

Nach jedem Restore: `RestoreTestRun` mit Checks und Fehlergrund speichern,
AuditEvent erzeugen, Backup-/Object-Referenzen dokumentieren und erst danach
Traffic schrittweise freigeben.

## Scheduler-/Retention-Fehler

Bei fehlendem Lauf oder abgelaufenem Lease: Jobstatus prüfen, nur einen Worker
claimen, Retry mit Backoff planen und Fehlergrund speichern. Bei Retention-
Fehlern keine Dateien manuell löschen; zuerst Registry, jüngstes gültiges
Backup, Prüfsumme und Audit prüfen. Löschkandidaten bleiben bis zur eindeutigen
Retention-Entscheidung erhalten.

## DB-/Storage-Konsistenz

Nach DB-Restore Attachment-/Report-Referenzen gegen private Objekte, Tenant-Key,
Version und Hash prüfen. `WARNING`/`INCONSISTENT` blockiert die Freigabe. Fehlende
Objekte werden nicht automatisch ersetzt oder gelöscht.

## PITR-Test

Nur mit freigegebenem TEST-/RESTORE-Ziel und `meterwerk_restore_*`-Datenbank:
Base Backup wählen, WAL-Archiv bis Zielzeitpunkt anwenden, Migrationstand und
Stichproben prüfen, Readiness ausführen, AuditEvent und `RestoreTestRun`
speichern. Produktion ist als PITR-Testziel verboten.

# Failover und Full-Drill

Bei einem Dienstfehler zuerst Health/Readiness und Lease-/Queue-Zustände prüfen, betroffene Instanz aus dem Traffic nehmen und keine pauschalen Resets ausführen. Danach Backup, Storage-Versionen, Migrationstand und externe Secret-Referenzen validieren. Der sichere Full-Drill läuft ausschließlich in `test`/`staging`: isolierte DB bereitstellen, Backup wiederherstellen, Storage-Konsistenz prüfen, Web/Worker/virtuelles MQTT starten, Login/Tenantzugriff, Readings, Reports, Rules, Attachments und AuditEvents validieren, anschließend RPO/RTO und Findings dokumentieren. Produktions-Restore, beliebige DB-URLs, öffentliche Buckets und automatische Löschungen sind ausgeschlossen.
