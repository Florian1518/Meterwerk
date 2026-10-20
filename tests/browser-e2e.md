# Browser-E2E-Suite

Die allgemeine Browser-E2E-Suite läuft mit dem lokalen Playwright-Harness. Phase 1C-B hat zusätzlich einen gezielten SUPER_ADMIN-Provisioning-Workflowtest. Dessen eigener Runner legt eine neue temporäre Loopback-PostgreSQL-Instanz an, seedet ausschließlich synthetische Testzugänge und beendet Next.js/PostgreSQL nach dem Lauf. Er verwendet keine vorhandene Datenbank, Hardware, MQTT-Verbindung, Zertifikatsausstellung oder Broker-ACL.

| Bereich      | Szenarien                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | Login, MFA/TOTP, Passwort-Reset, Logout, Session-Widerruf                                                                                                                                          |
| Mandant      | Tenant-Isolation, Rollen, Portfolio, Dashboard                                                                                                                                                     |
| Reporting    | Bericht erstellen, PDF- und CSV-Download                                                                                                                                                           |
| Betrieb      | Alarm bestätigen, Upload/Download, Onboarding                                                                                                                                                      |
| Sicherheit   | IDOR, Tenant-Manipulation, Invitation-/Reset-Replay, revoked Session                                                                                                                               |
| Gateway 1C-B | Kundenauswahl und Property-Scope, Anlage, Lifecycle-Bestätigung, Public Key, Kommunikationsmetadaten, Installation, Readiness-Blocker, Legacy-Key-API-Abwesenheit und direkte URL für Kundenrollen |

Die gezielte lokale Ausführung erfolgt mit `node .local/phase1cb-browser-runner.mjs`. Der Harness beschränkt Playwright auf das Desktop-Chromium-Projekt und vier spezifische Gateway-Szenarien.
