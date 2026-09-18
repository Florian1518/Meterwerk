# Phase-3-Prüfprotokoll – 18. September 2026

Ergebnis: Die technische Kette Modbus TCP → Edge-Gateway → MQTT → Ingestion-Worker → PostgreSQL → authentifiziertes Dashboard funktioniert. Die automatische visuelle Aktualisierung in einem echten Browser wurde nicht verifiziert, da kein Browser mit der verfügbaren Browserautomatisierung verbunden war. Der Dashboard-Test prüft die vom Server ausgelieferte HTML-Antwort; die Aktualisierung alle fünf Sekunden ist implementiert.

## Lokale Laufzeit

| Dienst           | Laufzeit / Port                                            |
| ---------------- | ---------------------------------------------------------- |
| PostgreSQL       | `smart-metering-db-1`, healthy, 127.0.0.1:5432             |
| Mosquitto        | `smart-metering-mqtt-1`, healthy, 127.0.0.1:1883 und :9001 |
| Meterwerk Web    | Node / Next.js, 127.0.0.1:3000                             |
| Modbus-Simulator | Node, 127.0.0.1:1502                                       |
| Ingestion-Worker | Node, ausgehende MQTT-/PostgreSQL-Verbindungen             |
| Edge-Gateway     | Node, ausgehende Modbus-/MQTT-Verbindungen                 |

Gateway `demo-edge-gateway`, Device `demo-modbus-device`, Zähler `MODBUS-DEMO-001`, Mandant Nordstern Immobilien, Campus am Stadtpark. Gateway und Device waren beim Abschluss ONLINE. Anmeldung mit `verwaltung@nordstern.demo` und dem ursprünglichen Demo-Passwort wurde gegen den gespeicherten Passwort-Hash erfolgreich geprüft; kein Passwort wurde geändert. Zugang und Startbefehle stehen in der README.

## Ergebnisse

| Prüfung                                                                 | Ergebnis                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------ |
| PostgreSQL-/MQTT-Healthchecks                                           | erfolgreich                                      |
| Vier versionierte Prisma-Migrationen                                    | erfolgreich                                      |
| Demo-Seed und separates Edge-Provisioning                               | erfolgreich                                      |
| Gateway ONLINE durch signierten Heartbeat                               | erfolgreich                                      |
| Device ONLINE und MQTT-Messwerte in PostgreSQL                          | erfolgreich                                      |
| Authentifiziertes Dashboard enthält den Demo-Zähler und geänderte Daten | erfolgreich                                      |
| Simulator stoppen → Device OFFLINE, Gateway bleibt ONLINE               | erfolgreich                                      |
| Simulator neu starten → Device ONLINE                                   | erfolgreich                                      |
| MQTT stoppen → persistente Queue wächst, Gateway OFFLINE                | erfolgreich                                      |
| MQTT neu starten → alle sieben gepufferten IDs gespeichert              | erfolgreich                                      |
| Queue leer nach Replay, Gateway und Device wieder ONLINE                | erfolgreich                                      |
| Vorhandene Nachricht erneut per MQTT senden                             | Duplikat bestätigt, weiterhin genau ein Messwert |
| Gateway-Sicherheit                                                      | 16 Prüfungen erfolgreich                         |
| Unit-Tests                                                              | 23 Tests erfolgreich                             |
| Datenbank-Integrationstests                                             | 18 Prüfungen erfolgreich                         |
| HTTP-Regressionstests                                                   | 23 Prüfungen erfolgreich                         |
| Prisma Generate, Typecheck, ESLint, Produktionsbuild                    | erfolgreich                                      |

Der abschließende vollständige E2E-Lauf erhöhte die MQTT-Messwertanzahl von 520 auf 538. Die Prozesse laufen danach weiter, daher steigen Messwertanzahl und Zeitstempel fortlaufend. Eine kurzzeitig nicht leere Queue während eines neuen Polls ist normal. Dynamische Testergebnisse und Prozess-IDs liegen unter `.local/phase3-results.json` und `.local/phase3-processes.json`.

Die Sicherheitstests umfassen ungültige Signaturen, unbekannte und widerrufene Credentials, falsche Gateway-Topics, fremde Device-IDs, tatsächlich vorhandene Devices aus einem fremden Mandanten, fehlende Gateway-Zuordnung, Mandanten-/Rolleninjektion, falsche Einheiten, falsche/veraltete Heartbeats, USER ohne Freigabe und explizite Mandantenauswahl für SUPER_ADMIN.

## Behobene Probleme und Grenzen

- Fehlender realer MQTT-Transport, Subscriber, Modbus-TCP-Simulator, Gateway-Authentifizierung und Offline-Worker wurden ergänzt.
- Queue-Dateifehler werden nicht mehr stillschweigend als leere Queue behandelt. Private Schlüssel liegen nur unter dem ignorierten `.local/`; Gateway-Credentials enthalten öffentliche Schlüssel.
- Ein bestehender Integrationstest wurde auf die öffentliche Fehlerabbildung für geschützte Löschungen korrigiert. Tests berücksichtigen den zusätzlichen Demo-Zähler. Wiederholtes Seeden überschreibt keine bestehenden Kontaktzeitpunkte mehr.
- Die Windows-Skriptrichtlinie blockierte den ersten Versuch, Dienste vor einem Wiederholungstest zu stoppen. Das Node-Stoppskript prüft Prozessidentitäten und benötigt keine Änderung dieser Richtlinie. Der E2E-Test verhindert jetzt einen zweiten Lauf mit noch laufenden gespeicherten Prozessen. Der abschließende Wiederholungstest war erfolgreich.
- Noch offen: visuelle Browserprüfung, produktives TLS/Broker-ACL-Deployment, Credential-Verwaltungsoberfläche, begrenzte Queue mit Quarantäne, skalierter Worker-Betrieb. Der lokale Modbus-Vertrag deckt ausschließlich die Demo-Strommessung ab.
