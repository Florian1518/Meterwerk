# Browser-E2E-Suite

Die lokale Ausführungsumgebung stellt keinen steuerbaren Browser bereit. Diese Abdeckung ist deshalb als ausführbare Testmatrix für Playwright/Cypress vorbereitet und muss in CI mit `BROWSER_E2E_BASE_URL` und einem Testmandanten laufen.

| Bereich    | Szenarien                                                            |
| ---------- | -------------------------------------------------------------------- |
| Auth       | Login, MFA/TOTP, Passwort-Reset, Logout, Session-Widerruf            |
| Mandant    | Tenant-Isolation, Rollen, Portfolio, Dashboard                       |
| Reporting  | Bericht erstellen, PDF- und CSV-Download                             |
| Betrieb    | Alarm bestätigen, Upload/Download, Onboarding                        |
| Sicherheit | IDOR, Tenant-Manipulation, Invitation-/Reset-Replay, revoked Session |

Die API-/Integrationssicherheit wird lokal separat ausgeführt; echte Browserläufe bleiben bis zur CI-Browserumgebung offen.
