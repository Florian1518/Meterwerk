# Produktions-Sicherheitscheckliste

Vor jedem Production-/Pilot-Release abhaken und mit Commit, Umgebung und
Verantwortlichem dokumentieren:

- [ ] HTTPS, HSTS, CSP, sichere Origin-Prüfung und Cookies
- [ ] MFA für privilegierte Konten und getesteter Recovery-Weg
- [ ] SESSION-, DB-, SMTP-, MQTT-, Push-, Webhook-, Storage- und Signing-Secrets gesetzt und rotierbar
- [ ] PostgreSQL nicht öffentlich; Migrationen versioniert; Backups und Restore getestet
- [ ] private S3-Objekte, Quarantine, Retention-/Löschjobs und Audit geprüft
- [ ] MQTT/mTLS, Device-Credentials und Worker-Leases geprüft
- [ ] Webhook-HMAC, Replay-Schutz, SSRF, Retry und Secret-Rotation geprüft
- [ ] API-Key-Scopes, Ablauf, Widerruf, Rotation und Limits geprüft
- [ ] produktiver verteiltes Rate-Limit-Backend verfügbar; lokaler Fallback deaktiviert
- [ ] Scanner verfügbar, CLEAN-Gate, Timeout, Retry, Healthcheck und Quarantine-Backlog überwacht
- [ ] Tenant-Isolation, USER-Grants, IDOR und SUPER_ADMIN-Tenant-Auswahl getestet
- [ ] Support, Diagnostic Bundles, Maintenance und Planänderungen auditiert
- [ ] Worker-/Queue-Monitoring und keine reale Hardware ohne Auftrag
- [ ] CI minimal berechtigt, Actions gepinnt, keine Secrets für untrusted PRs
- [ ] `corepack pnpm audit`, Lockfile-Prüfung und Secret Scan ohne unbekannte Findings
- [ ] Unit-, Security-, HTTP/API-, DB-Integrationstests und Build bestanden
- [ ] Reports/Exports/Logs datensparsam; keine Secrets oder unnötige PII
- [ ] Runbooks und Incident-Kontakte erreichbar
