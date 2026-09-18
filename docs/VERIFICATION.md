# Prüfprotokoll

Geprüft am 17.09.2026 unter Windows, Node.js 24.19, pnpm 11.19, PostgreSQL 17.10.

| Prüfung                                               | Ergebnis                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Prisma Client erzeugen                                | Erfolgreich                                                                           |
| Beide SQL-Migrationen auf leerer PostgreSQL-Datenbank | Erfolgreich                                                                           |
| Demo-Seed                                             | 2 Kunden, 7 Benutzer, 48 Zähler, 41.064 Messwerte                                     |
| TypeScript strict / Typecheck                         | Erfolgreich                                                                           |
| ESLint                                                | Keine Fehler oder Warnungen                                                           |
| Vitest                                                | 11 Tests bestanden                                                                    |
| PostgreSQL-Integration                                | 15 Prüfungen bestanden                                                                |
| HTTP-Integration gegen laufende Anwendung             | 23 Prüfungen bestanden                                                                |
| Optimierter Next.js-Produktionsbuild                  | Erfolgreich                                                                           |
| Browser: Anmeldung, Dashboard, Zählerliste            | Erfolgreich; Darstellung visuell geprüft                                              |
| Browser: Liegenschaft anlegen                         | Erfolgreich, Bestätigung und Tabellenzeile sichtbar; Testobjekt anschließend entfernt |
| Browser: Abmelden                                     | Erfolgreich, Rückkehr zur Login-Seite                                                 |

Die Integrationstests prüfen echte Datenbankbeziehungen und keine nachgebauten Prisma-Mocks. Enthalten sind fremde Mandantenparameter, direkte fremde Zähler-IDs, nicht freigegebene Liegenschaften, USER ohne Freigabe, fremde Elternobjekte und Messwerte, Rolleneskalation, Audit-Transaktionen und Passworthashes.

Die HTTP-Tests prüfen zusätzlich die neun Seiten, nicht angemeldete Zugriffe, abgelaufene und widerrufene Sitzungen, eingeschränkte Benutzerlisten, Origin-Prüfung und verbotene Schreibzugriffe. Die Testcookies werden ausschließlich für kurzlebige lokale Testsitzungen erzeugt und danach entfernt; die echte Anmeldung wurde separat im Browser geprüft.

Die Browserprüfung war manuell durch Automatisierungswerkzeuge ausgeführt, keine dauerhaft gespeicherte Browser-E2E-Suite. Responsive CSS ist implementiert; separate mobile Geräteprüfungen und ein Accessibility-Audit stehen noch aus. Der Build wurde lokal geprüft, kein Produktionsdeployment durchgeführt. Last-, Penetrations-, Wiederherstellungs- und Geräteintegrationstests stehen vor dem kommerziellen Einsatz aus.

Vorläufige Fehler wurden korrigiert: Argon2-const-enum bei isolatedModules, anonymer PostCSS-Export sowie pnpm-Freigaben für benötigte Paket-Buildskripte. Die Windows-Sandbox erforderte für PostgreSQL/tsx Zugriff auf die lokale Benutzerinformation; die entsprechenden lokalen Prüfungen wurden außerhalb dieser Sandbox ausgeführt.
