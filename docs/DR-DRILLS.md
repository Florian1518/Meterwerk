# Disaster-Recovery-Drills

DR-Übungen laufen ausschließlich in explizit freigegebenen `test`- oder `staging`-Umgebungen. Produktionsdatenbanken, produktive Storage-Buckets und reale Geräte werden nie automatisch verändert.

## Szenarien

Der Drill-Plan deckt Web, PostgreSQL, MQTT, tatsächlich vorhandene Rules-/Rollout-/MQTT-Prozesse, Object Storage, kombinierte Ausfälle, Datenbank+Web, Storage/DB-Inkonsistenz, fehlerhaftes Deployment, beschädigte Konfiguration und Secret-Rotation ab. Das ist ein geplanter Prüfumfang, kein Nachweis, dass jedes Szenario bereits automatisiert oder in einer Zielumgebung gelaufen ist. Ein eigenständiger Notification-, Report- oder Backup-Worker existiert derzeit nicht. Für jedes tatsächlich durchgeführte Szenario werden Erkennung, Health, Auswirkung, Datenrisiko, Wiederanlauf und Nachvalidierung festgehalten.

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
