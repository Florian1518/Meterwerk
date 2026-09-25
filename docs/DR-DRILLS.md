# Disaster-Recovery-Drills

DR-Übungen laufen ausschließlich in explizit freigegebenen `test`- oder `staging`-Umgebungen. Produktionsdatenbanken, produktive Storage-Buckets und reale Geräte werden nie automatisch verändert.

## Szenarien

Web, PostgreSQL, MQTT, Rules-, Device-, Notification-, Report- und Backup-Worker, Object Storage, kombinierte Worker-Ausfälle, Datenbank+Web, Storage/DB-Inkonsistenz, fehlerhaftes Deployment, beschädigte Konfiguration und Secret-Rotation werden mit Erkennung, Readiness/Health, Auswirkung, Failover, Datenrisiko, Wiederanlauf und Nachvalidierung geprüft. Web-Instanzen sind zustandslos; Sessions, Locks und Queues liegen in den gemeinsamen Diensten. Worker verwenden Heartbeats, Leases, Retry-Limits und nachvollziehbare Failed/Dead-Letter-Zustände. MQTT nutzt Store-and-forward, Message-IDs, Idempotenz und Backoff.

## Drill-Ablauf

1. Umgebung und Zielressourcen validieren, Incident und Ziel-RPO/RTO erfassen.
2. Isolierte Restore-Datenbank und private Storage-Ziele bereitstellen.
3. Backup auswählen, Restore und Migrationstand prüfen, Storage-Konsistenz prüfen.
4. Web, Worker und virtuelle MQTT-Komponenten starten; Readiness, Login, Tenantzugriff, Readings, Reports, Rules, Attachments und AuditEvents prüfen.
5. Zeitpunkte für Incident, Recovery, DB/Storage/Web/Worker/Kernfunktionen speichern. RPO/RTO werden nur aus gemessenen Werten berechnet, sonst `UNKNOWN`.
6. Findings mit Severity, Komponente, Maßnahme, Verantwortlichem und Status dokumentieren.

## PostgreSQL, Failover und Konfiguration

Providerunabhängig ist ein Primary/Replica- und Endpoint/DNS-Wechsel vorgesehen. Clients reconnecten mit Pool-Backoff; Readiness bleibt aus, bis die Datenbank schreibtauglich ist. Multi-Master ist nicht vorgesehen. Eine neue Instanz benötigt Release, Migrationen, externe Secret-Referenzen, PostgreSQL, MQTT, Storage, Mail, Push, Worker, Reverse Proxy und TLS.

## Eskalation und Wiederholung

Kritische Findings bleiben offen und erzeugen deduplizierte Operations-Events. Drills werden als `PLANNED`, `RUNNING`, `PASSED`, `PASSED_WITH_FINDINGS`, `FAILED` oder `CANCELED` gespeichert und mindestens nach der festgelegten nächsten Übung wiederholt. Restore, PITR, Löschung und Findings sind privilegiert und auditierbar.
