# Disaster Recovery

## Datenklassen

| Klasse            | Daten                                                                                                 | Wiederherstellung                              |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Kritisch          | PostgreSQL-Tenantdaten, User/Rollen, Meter/Devices, Readings, AuditEvents, API-/Webhook-Konfiguration | PostgreSQL Base Backup + WAL/PITR              |
| Wiederherstellbar | Reports, WorkOrder-Metadaten, Queue-/Worker-Zustände                                                  | DB-Backup; laufende Jobs werden neu eingeplant |
| Rekonstruierbar   | Aggregationen, Health-Metriken, Cache, abgeleitete Exporte                                            | aus Primärdaten/erneuter Berechnung            |
| Temporär          | Sessions, Locks, lokale Queues, Scanner-Leases                                                        | verfallen lassen und sicher neu erzeugen       |

Attachments, Fotos, Signaturen, Reports und Diagnostic Files liegen in privaten
Object-Storage-Objekten. Ihre Tenant-Zuordnung und Hashes liegen in PostgreSQL;
Restore muss Datenbank und Objekte konsistent abgleichen. Quarantäneobjekte
werden nach definierter Retention separat behandelt.

## Technische RPO/RTO-Ziele

Diese Werte sind Engineering-Ziele, keine SLA- oder Garantieversprechen:

| Szenario                    |                         RPO-Ziel |            RTO-Ziel |
| --------------------------- | -------------------------------: | ------------------: |
| Datenbankausfall            |                       15 Minuten |          60 Minuten |
| Verlust einer Web-Instanz   |                      0–5 Minuten |          15 Minuten |
| Worker-Ausfall              |          5 Minuten Queue-Zustand |          30 Minuten |
| Storage-Ausfall             |    15 Minuten Objekt-Replikation |         120 Minuten |
| Vollständiger Serververlust |                       24 Stunden |         240 Minuten |
| Fehlerhaftes Deployment     |           0 Minuten Datenverlust | 30 Minuten Rollback |
| Beschädigte Datenbank       | letzter geprüfter WAL/Base-Stand |         240 Minuten |

## PostgreSQL, Registry und Verification

`pnpm db:backup` verwendet PostgreSQL `pg_dump -Fc`, schreibt die Dump-Datei
nicht in die Datenbank und erzeugt eine SHA-256-Datei. Die Registry in
`BackupRecord` speichert Typ, Umgebung, Zeitpunkte, Status, App-/Git-/Migration-
Stand, Größe, Hash, Storage-Referenz, Retention und Fehlergrund. Binärdaten und
Credentials gehören nicht in die Registry.

Ein Backup gilt erst nach Datei-/Formatprüfung, erwarteter Größe, Prüfsumme,
lesbaren Metadaten und `pg_restore --list` als verifiziert. Ein beendeter
Backup-Prozess allein reicht nicht.

## Sicherer Restore-Test

`Backup auswählen → meterwerk_restore_*-Datenbank → pg_restore → Migration/
Schema prüfen → Stichproben und Foreign Keys → Readiness → RestoreTestRun und
AuditEvent`. Die Zielprüfung lehnt beliebige Datenbanknamen ab. Es gibt keinen
Reset und keinen Restore auf Development-/Production-Datenbanken.

## PITR

Produktiv wird ein PostgreSQL-Base-Backup mit archivierten WAL-Dateien benötigt.
Für PITR: isolierte Zielinstanz bereitstellen, Base Backup einspielen, WAL bis
zum dokumentierten Zeitpunkt anwenden, Migrationstand prüfen, Object Storage
und Datenbank referenziell validieren, Readiness testen. In Phase 5s wird keine
echte PITR auf produktiven Daten ausgeführt.

## Object Storage und Konfiguration

Private Buckets/Objekte, Versionierung sofern der Provider sie unterstützt,
Hash-/Tenant-Metadaten, Retention und getrennte Quarantäne werden vorausgesetzt.
Benötigte Wiederanlaufreferenzen sind nur Secret-Namen, keine Werte:
`DATABASE_URL`, `SESSION_SECRET`, `WEBHOOK_SECRET_ENCRYPTION_KEY`, Storage-
Endpoint/Bucket/Token, MQTT-CA/Cert/Key, Mail-/Push-Provider, Domains,
Reverse-Proxy/TLS, Worker- und Migration-Konfiguration.

## Monitoring und Einschränkungen

Überwacht werden fehlgeschlagene/zu alte Backups, fehlende gültige Backups,
Checksum-Fehler, Restore-Testfehler und Storage-Unerreichbarkeit. Events werden
dedupliziert und enthalten keine Backup-Inhalte oder Secrets. Providerabhängige
WAL-, Object-Versionierungs-, Retention- und Restore-Automatisierung muss in der
Produktionsumgebung noch eingerichtet und regelmäßig getestet werden.

## Scheduler und Retention

`BackupSchedule` hält Zeitplan, nächste Ausführung, letzte erfolgreiche
Ausführung, Retry-/Backoff-Zustand und Fehlergrund persistent. Ein Worker darf
fällige Jobs nur per Lease claimen; abgelaufene Leases werden reclaimt und
erfolgreiche Jobs über eindeutige Backup-Metadaten idempotent behandelt. Die
Retention unterscheidet tägliche, wöchentliche und monatliche Aufbewahrung.
Das jüngste gültige Backup wird niemals allein durch einen Retention-Lauf
gelöscht. Kandidaten werden zuerst als `EXPIRED` markiert, auditiert und erst
danach providerabhängig gelöscht.

## Storage-Versionen und Konsistenz

`BackupObjectVersion` speichert Objekt-Key, Tenant, Version-ID/ETag, Hash,
Größe, Status und Backup-Zuordnung. DB-/Storage-Konsistenz ist `CONSISTENT`,
`WARNING`, `INCONSISTENT` oder `UNKNOWN`. Fehlende Objekte werden nicht ersetzt
oder gelöscht; sie erzeugen einen Recovery-Event.

## Vollständiger Restore-Drill

Der Drill simuliert Incident und isoliert die Testumgebung, stellt DB und
private Objektversionen wieder her, prüft Migrationen, startet Web und Worker
und validiert Login, Tenantzugriff, Dashboard, Meter/Readings, Reports, Rules,
Attachments und AuditEvents. MQTT wird nur per Konfigurations-/Healthcheck
geprüft; keine reale Hardware wird verbunden. Stichproben werden als solche
gekennzeichnet.
