# Penetration-Testplan

Nur lokale Testdatenbank oder ausdrücklich freigegebene Stagingumgebung,
keine fremden Systeme, keine reale Hardware und keine destruktiven Aktionen.
Jeder Test erhält Datum, Umgebung, Build-Commit, Request-ID, Ergebnis und
Beleg. PII und Secrets werden in Belegen redigiert.

## Reproduzierbarer Ablauf

1. `corepack pnpm install --frozen-lockfile`, `corepack pnpm db:generate`, Migrationen auf isolierter Test-DB.
2. `SEED_DEMO=true` setzen; Testkonten für SUPER_ADMIN, TENANT_ADMIN, MANAGER, USER mit und ohne Grant anlegen.
3. App lokal starten, HTTP-Tests ausschließlich gegen `localhost` ausführen.
4. Nach jedem Test Daten und Sessions der eindeutigen Fixture-Tenants bereinigen; keine Produktionsdaten verwenden.
5. Ergebnisse in `tests/` reproduzierbar codieren und vor/nach Änderungen ausführen.

## Testmatrix

| Bereich                 | Checks                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Authentication/Sessions | Login Enumeration, Brute Force, Session Fixation/Rotation/Revocation, Hijacking, Logout-all           |
| Password Reset/MFA      | unbekannte E-Mail, Token-Replay/Expiry, MFA falscher Code, Recovery, Rate Limits                      |
| Authorization           | Attachment/Device/Meter/Support-IDOR, Cross-Tenant, USER ohne Grant, MANAGER/SUPER_ADMIN-Eskalation   |
| Browser/API             | CSRF/Origin, XSS in Textfeldern/Reports, SQLi in Query/Sortierung, sichere Fehler und Correlation IDs |
| SSRF                    | localhost, private/link-local/Metadata, DNS-Rebinding, Redirect, Schema, Timeout/Responsegröße        |
| Upload/Storage          | MIME-Spoofing, Magic Bytes, Traversal, Double Extension, Symlink, Quarantine, signed Token/Expiry     |
| API Keys                | Query-Parameter, falscher Scope, Ablauf/Widerruf/Rotation, Tenant-Umgehung, Key-/Tenant-Limit-Bypass  |
| Webhooks                | falsche HMAC, Timestamp/Replay, Secret Rotation, Redirect, Retry/Idempotency, Response-Bomb           |
| Exports                 | CSV Formula Injection, PDF Operand/Template Injection, Cross-Tenant Report, PII-Minimierung           |
| Privileged operations   | Support/Diagnostic/Maintenance/Planänderung, Audit, explizite Tenant-Auswahl                          |
| CI/Supply Chain         | Workflow permissions, untrusted PR secrets, pinned Actions, Secret Scan, lockfile, artifacts          |

Bestehende Unit-, Security-, API- und DB-Integrationstests bilden die
Regression-Baseline. Offene Befunde werden mit Risiko, Beleg, Mitigation und
Follow-up versehen; ein nicht ausgeführter Test ist `BLOCKED`, nicht bestanden.
