# Phase 4b – lokale Prüfung vom 18.09.2026

Getestet mit lokaler PostgreSQL-Demo, Mosquitto, Webserver, separatem Ingestion-Worker, TCP-Modbus-Simulator und Edge-Agent. Keine Herstellerhardware angeschlossen.

| Prüfung                               |                      Bestanden |
| ------------------------------------- | -----------------------------: |
| Unit-Tests                            |                52 in 7 Dateien |
| Bestehende Integrationsprüfungen      |                             18 |
| HTTP-/Berechtigungsprüfungen          |                             23 |
| Gateway-Sicherheitsprüfungen          |                             16 |
| Pilot-Integration                     |                             45 |
| Phase-3-Ausfall/Replay/Duplikatschutz |                             12 |
| Phase-4a-Modbus-E2E                   | 128 Assertions im letzten Lauf |
| Reale lokale MQTT-TLS-/ACL-Prüfungen  |                              7 |

Die Modbus-Suite zählt auch die beim Warten ausgeführten HTTP-Abfragen; ihre Assertionsanzahl variiert deshalb mit dem Timing. Alle vorgesehenen Fehler-/Recovery-Szenarien wurden durchlaufen. Pilot prüft unter anderem Credential-Erstellung, einmalige Ausgabe, Rotation, Widerruf, Ablauf, lastUsedAt, fremde IDs/Mandanten, USER mit/ohne Freigabe, MANAGER, explizite SUPER_ADMIN-Auswahl, Alarm-Deduplizierung und Health-Zugriff.

TLS-Test mit eigenem lokalen Broker auf Port 8883 und kurzlebigen Testzertifikaten: gegenseitiges TLS, eigenes Topic, fremde Veröffentlichung abgewiesen, fremde Zustellung unterbunden, Worker-Receipt, unbekannte CA und fehlendes Clientzertifikat abgewiesen. Testzertifikate und private Schlüssel verbleiben ausschließlich im ignorierten `.local/`.

Backup tatsächlich erzeugt und mittels SHA-256/Archivprüfung verifiziert, danach transaktional in die separate Datenbank `meterwerk_restore_phase4b` wiederhergestellt. Lesende Kontrolle: 2 Mandanten, 46.938 Readings und 23.856 technische Messwerte. Die aktive Datenbank wurde nicht überschrieben. Archiv und Prüfsumme liegen lokal unter `.local/backups/phase4b-verification.dump*` und gehören nicht ins Repository.

Während der Prüfung behoben: Worker-Start durch versehentlichen Web-Import, verpasstes MQTT-Connect-Ereignis beim Laden des Agent-Caches, PostgreSQL-Sperrreihenfolge für Modbus-Steuerbefehle und frühes Schließen von stdin durch `pg_restore --list`. Eine verwaiste lokale Agent-Sperre wurde nach Prüfung der Prozessidentität entfernt.

Nicht durchgeführt: physischer RS485-/Zählertest, Windows-Service-/systemd-Installation auf dem Zielgerät, Langzeit-/Lastabnahme und visuelle Browser-Bedienprüfung. Diese bleiben standortspezifische Abnahmeschritte. Die Tests belegen keine bereits erfolgte Installation an einem realen Pilotstandort.
