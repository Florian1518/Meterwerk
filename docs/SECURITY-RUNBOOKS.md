# Security Runbooks

Grundsatz: erst Belege sichern und Zugriff eindämmen, dann rotieren oder
wiederrufen. Keine pauschale Löschung, kein Reset und keine Kontosperre ohne
Recovery-Plan. Alle Schritte erhalten Incident-ID, Actor, Tenant, Zeitpunkt und
AuditEvent.

## Gemeinsamer Ablauf

Erkennen: Alert, AuditEvent, Scanner-/Rate-Limit-Metrik und betroffene IDs
sichern. Eindämmen: nur den betroffenen Key, Endpoint, Account, Tenant oder
Worker deaktivieren. Rotieren/Widerrufen: neue Credentials über den sicheren
Adminpfad ausgeben, alte kontrolliert auslaufen lassen. Auswirkungen:
Audit-, Storage-, Mail-, Webhook-, API- und Access-Logs tenantübergreifend
prüfen. Wiederherstellen: Least-Privilege-Zugang testen, Monitoring erhöhen,
Backups nur nach Integritätsprüfung verwenden. Dokumentieren: Timeline,
Entscheidungen, Datenumfang, Benachrichtigungen und Follow-up.

## Ereignisspezifische Maßnahmen

| Ereignis                     | Eindämmung / Rotation                                                              | Prüfung und Wiederherstellung                                |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| API-Key kompromittiert       | sofort widerrufen, neuen Key mit minimalen Scopes ausgeben                         | `lastUsedAt`, API-Audit, Tenant- und Zeitfenster prüfen      |
| Device-/Gateway-Credential   | einzelnes Credential rotieren, Queue/Device kontrolliert pausieren                 | MQTT-/Ingestion-Audit, Firmware/Config nicht löschen         |
| Benutzerkonto kompromittiert | Sessions widerrufen, Passwort/MFA-Recovery kontrollieren                           | Login/MFA-Historie, Exporte und Supportzugriffe prüfen       |
| MFA-Recovery                 | Identität über zweiten Kanal prüfen, Recovery-Code einmalig verbrauchen            | MFA-Audit, neue Geräte registrieren, alte Sessions schließen |
| Webhook-Secret               | Endpoint pausieren oder Secret rotieren; Empfänger koordinieren                    | Signaturfehler, Replay, Retry/Dead-Letter prüfen             |
| Storage-Leak                 | Bucket/Endpoint privat setzen, Token-/Credential-Rotation, betroffene URLs sperren | Access-Audit, Hash/Retention, notwendige Benachrichtigung    |
| Malware-Fund                 | Attachment quarantänisieren, CLEAN-Auslieferung sperren                            | Scanstatus, betroffene Downloads, Scannerzustand prüfen      |
| Cross-Tenant-Verdacht        | betroffenen Pfad/Key/Supportaktion pausieren                                       | DB-Audit, Request-/Correlation-IDs, Grant-/FK-Sichten prüfen |
| Secret im Repository         | Commit/Build stoppen, Secret rotieren, History nicht blind löschen                 | Secret-Scan, Artefakte und Logs prüfen                       |
| SUPER_ADMIN-Auffälligkeit    | Plattform-Session widerrufen, zweiten Admin hinzuziehen                            | Tenant-Auswahl, Diagnostics, Maintenance/Plan-Audit prüfen   |
| Supply-Chain-Fund            | Dependency/Build-Job isolieren, sichere Version bewerten                           | Lockfile, SBOM, Build-Artefakte und Release-Gates prüfen     |
| Datenabflussverdacht         | nur betroffene Zugänge und Exporte eindämmen                                       | Umfang minimieren, Retention/Legal-Prozess nach Vorgabe      |

Nach jedem Vorfall: kein öffentliches Detail in Logs, keine Secrets in Tickets,
Post-Incident-Test ergänzen und Rest-Risiko durch Verantwortlichen abzeichnen.
