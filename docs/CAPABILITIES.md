# Produktfähigkeiten und Validierungsstatus

## Aktuell: Linux-Container-Gates ab ddbedc8, 01.10.2026

Web Runtime 8/8 (7 HTTP-/Browser-Checks plus Container läuft), Worker Runtime und
SIGTERM 3/3 bestanden. Web-SIGTERM: Exit 143 ohne SIGKILL; echter laufender Request
endet mit 200, Drain-Shutdown 11,90 s. Web-/Worker-Restart, synthetische Lease-
Übernahme (2 Claims, 1 Completion), DB-Recovery und MQTT-Reconnect lokal belegt.
Linux-Performance: 210 Samples (150 HTTP + 60 DB-Zyklen), 0 Fehler, 7/7 Budgets;
sequentielle synthetische Messung mit leeren Worker-Queues, keine Produktionslast.
Zwei vorhandene Images weiterverwendet, Image-SBOMs exakt zugeordnet (298/623).

**NICHT RC-FREIGABEFÄHIG:** Worker-Image enthält 309 Testdateien aus Abhängigkeiten
und Pakete für Playwright, TypeScript und Prisma CLI. Image-Ausschluss-Gate FAILED;
Bereinigung und gezielte Neuabnahme offen. tsx fehlt, keine echten Credentials
im beschriebenen Dateisystem-/Konfigurationsscan gefunden. Historische Image-Layer
und unveränderlicher Base-Digest sind nicht unabhängig vollständig geprüft.
Web-Shutdown unter laufender Anfrage benötigt ausreichend Zeit (>10 s im Test).
EXTERNAL_VALIDATION_PENDING: finaler CI-SHA, Staging, Signing, Provider, HA/Restore,
repräsentative Last; HARDWARE_VALIDATION_PENDING unverändert.
Keine Produktcode-/Dockerfile-Änderung, kein finaler RC-Commit. Die Linux-
allowBuilds-Ergänzung in pnpm-workspace.yaml bleibt uncommittet.

Details: [Acceptance-Ergebnis](acceptance/SOFTWARE-ACCEPTANCE-RESULT.md) und
[Container-Evidence](acceptance/CONTAINER-RUNTIME-DDBEDC8.json).

## Historische Prüfstände — durch obigen aktuellen Stand ergänzt

Historischer Prüfstand ab `5d8fc58`, 01.10.2026: Softwarefix übernommen PASSED;
Linux-Image-Runtime NOT_EXECUTED / EXTERNAL_VALIDATION_PENDING (Daemon fehlt).
Neuer lokaler Performance-Lauf FAILED vor der ersten Messreihe, da Windows
Application Control das Argon2-Binding blockiert. Historische Performance-/
Standalone-Erfolge sind keine Ergebnisse dieses Laufs. CI CONFIG_VERIFIED,
Signing SIGNING_PREPARED_NOT_VERIFIED; Staging, Provider und Hardware offen.
**Softwareseitige v1.0-RC-Vorbereitung: NEIN**, lokale Gates nicht abgeschlossen.
Details: [Acceptance-Ergebnis](acceptance/SOFTWARE-ACCEPTANCE-RESULT.md) und
[Evidence](acceptance/CONTAINER-READINESS-5D8FC58.json). Es wurden keine neuen
Produktfähigkeiten implementiert oder als container-validiert deklariert.

Aktueller Fortsetzungsstand, 01.10.2026: `943d23f` analysiert; offene Image-Gates
gezielt korrigiert und mit 5/5 lokalen Regressionstests geprüft. Kein realer
Containerlauf, keine RC-Freigabe. Der
[Checkpoint-Bericht](acceptance/PHASE-5V-CHECKPOINT-943D23F.md) aktualisiert die
nachfolgenden historischen Angaben vom 29.09.2026.

Aktueller Abnahmestand: **29.09.2026, Worker-Runtime-Fix ab WIP `edda867`, keine RC-Freigabe**. Die
Fortsetzung enthält echte Demo-Szenariowirkungen (13/266 DB-/HTTP-Checks; zusätzlich
2 Browserfälle), geprüfte kanonische 47-Migrations-Pfade, lokale Performancewerte
mit bestandenem Regression-Gate und eine transitive SBOM mit lokalen Build-Artefakten.
Eine ergänzte mobile Field-Service-Journey prüft den Wartungsabschluss ohne API-Mocks.
Die v1.0-Datenbankbaseline ist auf die 47 kanonischen Migrationen festgelegt;
Upgrade ab `v0.4b-pilot-ready` (7 Migrationen) und Dependency-Audit auf dem
aktuellen Lockfile sind bestanden. Nicht getaggte interne/dev-Basen sind nicht
unterstützt. Das lokale Windows-x64-Standalone-Artefakt bestand den
Health-/Readiness-/Login-/Dashboard-Smoke (4/4). Der Worker-Image-
Softwarefehler ist durch JS-Bundles und Produktionsabhängigkeiten behoben; die
statische Prüfung und lokalen Release-Smokes bestanden. Reale Image-Builds und
-Smokes waren mangels Docker-Linux-Daemon nicht ausführbar und bleiben extern
pending. Signing, CI-Lauf auf finalem SHA und Staging bleiben offen. Historischer
Teil-3-Text unten beschreibt den Commit, nicht die nachfolgende Fortsetzung.
Siehe [aktueller Fortsetzungsbericht](acceptance/PHASE-5V-RESUME.md).

Status: **IMPLEMENTED** = Code vorhanden; **TESTED** = durch automatisierte Softwaretests abgedeckt; **ENVIRONMENT_TEST_PENDING** = Zielumgebung noch zu validieren; **HARDWARE_VALIDATION_PENDING** = reale Geräteprüfung offen; **PROVIDER_VALIDATION_PENDING** = konkreter externer Provider nicht validiert. Status behauptet keine Kundenfreigabe oder SLA.

| Bereich                                     | Status                                                | Hinweis                                                                                    |
| ------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Multi-Tenancy, Auth, Rollen                 | IMPLEMENTED, TESTED                                   | Rechte in Services; USER benötigt PropertyGrant.                                           |
| Strom, Wasser, Gas, Wärme, Zähler/Messwerte | IMPLEMENTED, TESTED                                   | Reale Zähler-/Datenvalidierung offen.                                                      |
| MQTT Gateway Ingestion                      | IMPLEMENTED, TESTED, ENVIRONMENT_TEST_PENDING         | Broker-/Zertifikatsbetrieb muss separat konfiguriert werden.                               |
| Modbus TCP / RTU                            | IMPLEMENTED, TESTED, HARDWARE_VALIDATION_PENDING      | Simulator vorhanden; reale Hardware offen.                                                 |
| M-Bus / W-MBus / Pulse / LoRaWAN            | ENVIRONMENT_TEST_PENDING, HARDWARE_VALIDATION_PENDING | Protokoll-/Modellvorbereitung ist nicht gleich getesteter Gerätetreiber.                   |
| REST Device Ingestion                       | IMPLEMENTED, TESTED                                   | Credentialbasierte Schnittstelle; siehe API-Doku.                                          |
| Vendor APIs                                 | PROVIDER_VALIDATION_PENDING                           | Kein pauschaler Herstellerbetrieb belegt.                                                  |
| Analytics, Forecast, Costs, Dashboards      | IMPLEMENTED, TESTED                                   | Forecast ist Schätzung; Kostenmodellumfang siehe Analytics-Doku.                           |
| Rules, Alarms, Anomalies                    | IMPLEMENTED, TESTED                                   | Regel-/Datenbasis beachten; externe Zustellung nicht pauschal aktiv.                       |
| Reports, CSV/PDF                            | IMPLEMENTED, TESTED                                   | Berechtigungs- und Datenumfang siehe Reporting.                                            |
| Public API, Webhooks                        | IMPLEMENTED, TESTED, ENVIRONMENT_TEST_PENDING         | Konkreter Empfänger-/Produktionsbetrieb offen.                                             |
| PWA, WorkOrders, Device Management, Support | IMPLEMENTED, TESTED                                   | Browser-/Geräteabdeckung separat prüfen.                                                   |
| Security                                    | IMPLEMENTED, TESTED, ENVIRONMENT_TEST_PENDING         | Deploymenthärtung/Monitoring ist betreiberabhängig.                                        |
| Backup/DR                                   | IMPLEMENTED, TESTED, PROVIDER_VALIDATION_PENDING      | Provider-PITR und vollständiger isolierter Drill nicht generell ausgeführt.                |
| Staging/Demo                                | IMPLEMENTED, ENVIRONMENT_TEST_PENDING                 | Lokale Scripts vorhanden; Staging Compose ist nicht als end-to-end validiert dokumentiert. |
| CI/CD                                       | IMPLEMENTED, TESTED                                   | CI und Release-Artefakt; Deployment/Production Promotion manuell/extern.                   |

Hardwarestatus: softwareseitige Simulatoren/Verträge können automatisiert getestet sein. Physische Modbus/RS485, M-Bus, W-MBus, Pulse, LoRaWAN und Hersteller-API-Validierung steht aus. Siehe [Protokolle](PROTOCOLS.md), [Commissioning](COMMISSIONING.md) und [Known Limitations](KNOWN-LIMITATIONS.md).

Phase-5v-Teil-3-Status (28.09.2026): Demo-Szenario-Auswahl ist vorhanden, erzeugt aber noch keine szenariospezifischen Produktzustände (**RELEASE_BLOCKER**). Clean Install und Upgrade von 39 auf 46 Migrationen sind für die geänderten lokalen Dateien in Teil 2 belegt; Kompatibilität mit vorab registrierten Originalchecksummen der Migrationen 008/009 bleibt **NOT_EXECUTED / RELEASE_BLOCKER**. Dependency Audit und Performance Gate sind **NOT_EXECUTED**. Transitive Lockfile-SBOM, Container-Images, Signierung und lokale Staging-Verifikation sind nicht belegt. Siehe [Software Acceptance Result](acceptance/SOFTWARE-ACCEPTANCE-RESULT.md).

# Phase 5v Release-Runtime-Status

Die vorhandenen Worker (Rules, MQTT-Ingestion und Rollout) besitzen einen
Produktions-Buildpfad zu JavaScript-Bundles; das geplante Worker-Containerimage
verwendet eine Produktions-only Dependency-Installation und startet feste
Node-Entrypoints unter einem nicht-root Nutzer. Tatsächliche Image-Läufe sind
nicht bestätigt, solange der lokale Docker-Linux-Daemon nicht verfügbar ist.
Der lokale Performance-Nachweis deckt synthetische HTTP-/DB-Last ab; Staging,
externe Provider, Failover/HA, Signierung und Hardware sind gesonderte
Validierungsschritte.
