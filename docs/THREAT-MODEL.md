# Meterwerk Threat Model (STRIDE)

Bewertung: Assets, Grenzen und Eintrittspfade werden mit STRIDE (Spoofing,
Tampering, Repudiation, Information Disclosure, Denial of Service,
Elevation of Privilege) betrachtet. Restrisiken bleiben offen, bis sie mit
produktiver Infrastruktur und Daten nachgewiesen sind.

| Asset                            | Trust Boundary               | Bedrohung / Eintrittspfad                             | Schutzmaßnahme                                                                          | Restrisiko                                             |
| -------------------------------- | ---------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Sessions, Passwörter, MFA        | Browser → Web-App            | S/T: Credential Theft, Fixation, Brute Force          | Argon2id, HMAC-Sessions, Rotation, HttpOnly/Secure/SameSite, MFA, Limits                | XSS/Endpunktgerät bleibt ein Risiko                    |
| Tenant-Daten und Property Grants | Request → Server/Prisma      | I/E: IDOR, fremde IDs, Tenant-Parameter               | serverseitige Tenant-/Parent-/Grant-Scopes, Composite FKs, Audit                        | Fehler in neuem Pfad möglich                           |
| Public API / API Keys            | Internet → API               | S/I/D: Key-Abuse, Scope-Eskalation, Enumeration       | Hash-only, Bearer-only, Ablauf/Widerruf/Rotation, Key-/Tenant-Limits, generische Fehler | Distributed Limiter muss produktiv überwacht werden    |
| Webhooks                         | Web-App → Internet           | S/T/D: Replay, SSRF, Redirect, Secret-Leak            | HMAC+Timestamp, eventId-Unique, DNS-Pinning, HTTPS, Timeout, Retry/Dead Letter          | Zielsystem/Netzwerkfehler                              |
| Uploads und Reports              | Browser → Quarantine/Storage | I/D/E: Polyglot, Malware, Formula/PDF Injection       | MIME/Magic Bytes/Name, Hash, Quarantine, CLEAN-Gate, escaped CSV/PDF                    | Scanner/Retention müssen produktiv betrieben werden    |
| Object Storage                   | App → lokaler/S3-Provider    | I/D: IDOR, Public Bucket, Traversal                   | private Objekte, tenant keys, server credentials, signed short-lived tokens             | Fehlkonfiguration des Providers                        |
| Worker, Queues, Idempotency      | App → PostgreSQL/Worker      | T/D: Replay, Doppelaktionen, Queue poisoning          | Unique Constraints, Leases, correlation/request IDs, Audit                              | DB-/Worker-Ausfall                                     |
| MQTT/Ingestion/Devices           | Gateway → Ingestion          | S/T/D: falsche Geräte, Replay, DoS                    | separate Credentials, TLS/mTLS, Device Tokens, Rate Limits, messageId Unique            | Geräte-/Broker-Physik außerhalb Web-App                |
| Support/Field Service            | Tenant User/Admin → Server   | I/E/D: interne Notizen, Support-Missbrauch            | Rollen, tenant scopes, USER-Beschränkung, Audit, idempotente Aktionen                   | Privilegierter Insider                                 |
| SUPER_ADMIN / Maintenance        | Plattformgrenze → Mandanten  | E/I: falsche Tenant-Auswahl, breite Diagnose          | explizite Tenant-Auswahl, Rollenprüfung, Audit, reduzierte Bundles                      | MFA-Pflicht für Plattformkonto noch Deployment-Aufgabe |
| CI/CD und Dependencies           | GitHub → Build/Deploy        | T/E: untrusted PR, Actions, Supply Chain, Secret Leak | pinned Actions, read permissions, frozen lockfile, Secret Scan, Audit                   | Audit muss regelmäßig gegen Lockfile wiederholt werden |
| Staging/Production               | Deployment → Internet/DB     | S/D/I: schwache Secrets, falsche Cookies, offene DB   | HTTPS/HSTS/CSP, Secret-Konfiguration, private DB/Storage, Checklist                     | Umgebungsdrift                                         |

Produktionsgrenzen: ClamAV/externer Scanner, verteiltes Rate-Limit-Backend,
Retention-Jobs, Backup-Wiederherstellung und externe Monitoring-Alarme müssen
vor Freigabe nachgewiesen werden.
