# Meterwerk Runbooks

## Datenbank nicht erreichbar

System Health und Readiness prüfen, Netzwerk/DNS und PostgreSQL-Erreichbarkeit kontrollieren, danach Logs und Verbindungsgrenzen prüfen. Migrationen erst nach bestätigter Erreichbarkeit mit `prisma migrate deploy` anwenden. Keine Datenbank zurücksetzen.

## Worker hängt

Heartbeat, Fehlerstreak, ältesten Job und Queue-Backlog prüfen. Einen einzelnen sicheren Retry verwenden, anschließend den Worker kontrolliert neu starten. Keine Jobdaten direkt manipulieren.

## Queue-Backlog

Queue-Typ, Tenant, ältesten Eintrag und Fehlerursache filtern. Retry nur mit Correlation ID und Limit auslösen; nicht benötigte Jobs fachlich über Cancel beenden.

## Webhook-, Mail- oder Notification-Störung

Providerstatus, Outbox-Fehler und Cooldown-Deduplizierung prüfen. Einzelnen Retry auslösen und Ergebnis beobachten. Secrets und Signaturmaterial nicht exportieren.

## Ingestion- oder Gateway-/Device-Ausfall

Worker Heartbeat, Gateway-Heartbeat, Queuegröße, Device-Diagnose und offene Alarme prüfen. Maintenance Window berücksichtigen und Support/Incident verknüpfen. Keine Hardware-Pings oder Konfigurationsänderungen ohne freigegebenen Workflow.

## Firmware-Rollout pausiert

Fehlerquote, Canary-Ziele, Batchstatus und Rollback-Metadaten prüfen. Rollout pausiert lassen, Ursache dokumentieren und erst nach Prüfung fortsetzen. Kein automatisches OTA erzwingen.

## Storage nicht erreichbar

Storage-Health, signierte URLs, Größenlimits und lokale Outbox prüfen. Keine öffentlichen Buckets aktivieren und keine Uploads manuell ausliefern.

## Kritischer Incident

Incident eröffnen, Severity CRITICAL setzen, betroffene Komponenten und Tenant erfassen, Verantwortlichen zuweisen, Timeline führen und Stakeholder über die Notification-Abstraktion informieren. Nach Lösung Monitoring und Abschluss dokumentieren.

## Maintenance Mode

Nur SUPER_ADMIN darf globalen oder tenantbezogenen Maintenance Mode aktivieren. Grund und Endzeit setzen, sichtbaren Hinweis prüfen und nach Behebung explizit deaktivieren. Keine Daten löschen.

## Backup und Restore

Letzten Backup- und Restore-Teststatus über die vorhandenen Backup-Werkzeuge prüfen. Restore ausschließlich in eine separate Datenbank vorbereiten; kein automatischer Produktions-Restore und kein direkter Restore durch Support.
