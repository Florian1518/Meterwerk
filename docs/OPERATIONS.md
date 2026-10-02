# Betriebs- und Operations-Handbuch

## Externes Staging

Verbindliche Start-, Smoke-, Backup- und Rollback-Schritte sowie Monitoring-Schwellen
stehen in [STAGING.md](STAGING.md). Noch kein externer Betrieb nachgewiesen.
Web mindestens 30 Sekunden Shutdown-Frist; Worker und PostgreSQL zunächst 60,
MQTT/Proxy 30 Sekunden. Startvorgabe: begrenzte on-failure-Restarts mit externem
Alarm und manuellem Stopp bei wiederholtem Konfigurationsfehler. Im bestehenden
Staging-Compose sind diese Vorgaben noch nicht umgesetzt.

Der lokale Backup-Helfer verwendet Standard-Compose und Datenbanknutzer/-name
meterwerk; er darf nicht unverändert für meterwerk_staging verwendet werden.
Backups separat verschlüsselt speichern und Restore in neuer isolierter DB prüfen.
Readiness prüft DB, nicht MQTT/Worker/Storage; Prozessstatus durch fachlichen
Fortschritt und Queue-/Lease-Überwachung ergänzen. Mail ist derzeit lokale
In-Memory-Outbox; SMTP/API sind keine implementierte externe Zustellung.

## Dienste und Health

Web liefert `/api/health/live`, `/api/health/ready` und `/api/system/build-info`. PostgreSQL ist die fachliche Datenquelle; MQTT, Web, Rules-/Rollout-/Notification-Worker und Object Storage werden getrennt überwacht. Logs enthalten keine Secrets oder unnötigen Kundendaten.

Start/Stop lokal: `pnpm db:local` oder `docker compose up -d db mqtt`; Web `pnpm dev`; Stop mit Strg+C bzw. `docker compose down`. Staging verwendet ausschließlich `compose.staging.yaml` und eigene Variablen.

## Regelbetrieb

Migrationen mit `pnpm db:migrate`, Backups/Restore nach [Disaster Recovery](DISASTER-RECOVERY.md), Worker-Leases und Queue-Zustände über Operations prüfen. MQTT-Ausfall führt zu Store-and-forward/Backoff; Storage-Fehler dürfen keinen erfolgreichen Uploadstatus erzeugen. Maintenance Mode, Supportaktionen und privilegierte Änderungen werden auditiert.

## Alarme und Wiederherstellung

Backup-/Restore-/Storage-/Security-Ereignisse werden dedupliziert überwacht. Bei Störung zuerst Readiness, Logs, DB/MQTT/Storage-Erreichbarkeit und Worker-Leases prüfen. Keine produktiven Resets, Migration-Rollbacks oder Löschungen ohne Recovery-Runbook.
