# Monitoring und Observability

## Was die Anwendung tatsächlich meldet

`/api/health/live` dient dem Prozess-Liveness-Check. `/api/health/ready` prüft Datenbankverbindung und produktionsrelevante Konfiguration; dies ist kein vollständiger MQTT-, Storage- oder Worker-Verfügbarkeitsnachweis. Build-Informationen liefert `/api/system/build-info`. Endpunkte in einer realen Installation über Reverse Proxy nur passend exponieren.

Worker-Status und einige Operations-Daten werden aus der Anwendung/DB bereitgestellt. In-Memory-Zähler sind pro Prozess und gehen beim Neustart verloren. Eine externe Metrik-Pipeline, ein vollständiges APM-System oder produktive Alarmzustellung darf daraus nicht abgeleitet werden.

## Diagnosebereiche

- **Web/DB:** Live, Ready, DB-Verbindungen, Fehlerzeitpunkt und Migrationstand.
- **Worker/Queue:** Heartbeat/Lease soweit persistiert, Jobalter, Retries und fehlgeschlagene Jobs.
- **MQTT:** Broker-Health, Verbindung, Topic-/Signaturfehler und Edge-Queue-Backlog.
- **Storage:** Erreichbarkeit, Upload-/Downloadstatus, Quarantäne und Konsistenzprüfungen.
- **Backup/DR:** Alter und Verifikation des letzten Backups, Restore-Test und offene Findings.
- **Security:** SecurityEvents und AuditEvents mit minimalen Metadaten.
- **Staging:** Build-SHA, Migrationstand, Readiness und Smoke/E2E-Ergebnisse.

Logs ohne Tokens, Secrets oder unnötige Kundendaten schreiben. Correlation IDs helfen zusammengehörige Vorgänge zu finden; sensible Request-Payloads nicht protokollieren. Alarm-Deduplizierung und externe Benachrichtigung hängen von der jeweiligen Integration ab. Siehe [Operations](OPERATIONS.md), [Security](SECURITY.md) und [Disaster Recovery](DISASTER-RECOVERY.md).
