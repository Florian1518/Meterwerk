# Troubleshooting

| Symptom                         | Mögliche Ursache                          | Diagnose                                    | Sichere Lösung                                       |
| ------------------------------- | ----------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Web startet nicht               | fehlende Variablen/Buildfehler            | `pnpm typecheck`, Logs                      | Variablen korrigieren, neu bauen                     |
| PostgreSQL nicht erreichbar     | DB nicht gestartet/falsche URL            | `/api/health/ready`, `pg_isready`           | lokale DB/URL prüfen, keine fremde DB zurücksetzen   |
| Prisma-Migration fehlgeschlagen | falscher Stand/Berechtigung               | `pnpm migration:check`                      | Backup/Runbook prüfen, Migration gezielt beheben     |
| MQTT nicht erreichbar           | Broker/TLS/Port                           | Broker-Logs, MQTT-Health                    | Broker und getrennte Credentials prüfen              |
| Gateway/Meter offline           | Verbindung/Lease/Devicezustand            | Fleet-/Device-Health                        | keine reale Hardwareannahme; Simulator/Queue prüfen  |
| Readings fehlen                 | Zeitfenster, Ingestion oder Offline-Gerät | Reading-Quelle/Qualität prüfen              | Store-and-forward und Idempotenz kontrollieren       |
| Worker hängt/Queue wächst       | Lease, DB oder Retry                      | Operations/Worker-Logs                      | Worker kontrolliert neu starten, keine Blind-Replays |
| Storage nicht erreichbar        | Endpoint/Bucket/Credentials               | Storage-Health                              | private Zielkonfiguration und Retry prüfen           |
| Upload quarantined              | Scanner PENDING/INFECTED/FAILED           | Attachment-Status/Audit                     | nicht ausliefern; Scanner/Quarantine bearbeiten      |
| Webhook fehlgeschlagen          | Signatur, SSRF, Timeout, Ziel             | Delivery-/Retry-Status                      | Secret/Ziel/Backoff prüfen, keine Prod-Demo-Ziele    |
| API-Key funktioniert nicht      | Scope, Ablauf, Widerruf, Rate Limit       | API-Key-Metadaten                           | rotieren/Scope korrigieren, niemals Query-Parameter  |
| Mail nicht zugestellt           | Sandbox/Provider/Empfänger                | Outbox/Provider-Logs                        | Testziel prüfen; keine echten Empfänger verwenden    |
| Demo/Seed schlägt fehl          | Guard, Passwort, DB-Marker                | `pnpm demo:verify`, `pnpm env:check`        | nur DEMO/TEST verwenden                              |
| Build schlägt fehl              | TypeScript/Prisma/Format                  | `pnpm typecheck`, `pnpm lint`, `pnpm build` | Fehler beheben, keine Lockfile-Umgehung              |
| Docker nicht erreichbar         | Docker Desktop/Compose                    | `docker version`, `docker compose config`   | Docker Desktop starten; fehlende Secrets setzen      |
