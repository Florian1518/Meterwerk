# Worker-Betrieb

Worker sind eigene Node-Prozesse und teilen Datenbank/Queue-Zustand. Die vorhandenen Laufzeitprozesse sind:

| Prozess | Start                                                                                  | Aufgabe                                                                     |
| ------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| MQTT    | `pnpm mqtt-worker`                                                                     | Gateway-Ingestion, Heartbeats/Offline-Prüfung und Webhook-Outbox-Zustellung |
| Rules   | `pnpm rules-worker`                                                                    | Regelprüfung in wiederkehrenden Durchläufen                                 |
| Rollout | `RUN_WORKER=true pnpm exec tsx --conditions=react-server src/server/rollout-worker.ts` | fällige Device-Rollout-Schritte                                             |

`src/server/rollout-worker.ts` läuft nur, wenn `RUN_WORKER=true` gesetzt ist. Ein separates Notification-, Report- oder Backup-Worker-Programm ist in dieser Codebasis nicht vorhanden; entsprechende fachliche Funktionen oder persistente DR-Metadaten sind kein Beleg für einen eigenständigen produktiven Scheduler.

## Betrieb und Fehler

Jeder Prozess braucht eine passende `DATABASE_URL`; MQTT zusätzlich den Broker. Prozesse mit Supervisor/Container neu starten und Logs anhand Zeitpunkt/Correlation-ID korrelieren. Heartbeats und Lease-Zustände nur soweit verfügbar in Operations prüfen. Worker-Retries, Lease-Ablauf und Dead-Letter-Verhalten sind jobtypabhängig; vor Neustart keine Jobs manuell duplizieren oder blind erneut ausführen. Nach Neustart Readiness und Ergebniszustände prüfen.

Staging Compose sowie die vollständige Worker-Ausführung sind erst nach Korrektur/Validierung der dortigen Image- und Environment-Konfiguration als funktionsfähig anzusehen. Siehe [Staging](STAGING.md) und [Monitoring](MONITORING.md).
