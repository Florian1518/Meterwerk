# Produktfähigkeiten und Validierungsstatus

## Aktuell: finale lokale RC-Bewertung auf 1e6589e, 02.10.2026

**LOCAL SOFTWARE ACCEPTANCE: PASSED.**
**METERWERK V1.0 RC PREPARATION: READY.**
**LOCAL SOFTWARE RELEASE BLOCKER: NEIN.**

PASSED_LOCAL: Ausgang master/clean auf
`1e6589e2ee84eae787e444a0ab311fb1020853e6`; Web und Worker als
`meterwerk-web:rc-1e6589e` / `meterwerk-worker:rc-1e6589e` neu gebaut.
Worker Content/Secret Gate, Runtime 3/3, SIGTERM 3/3, Web Runtime 8/8,
Web-SIGTERM/Restart, finale imagegebundene SBOMs und gezielte Static-/Regression-Gates bestanden.
Lease-Recovery bei bytegleichen Bundles übernommen. Alle bisherigen lokalen
Softwareblocker ausdrücklich CLOSED. Breite App-/DB-/Browser-/Demo-, Recovery-
und Performance-Nachweise für unveränderte Pfade übernommen; kein Produktionslastnachweis.

EXTERNAL_VALIDATION_PENDING: echte CI auf finalem SHA, Staging/Promotion, Signing,
Provider, PITR/Full Restore, Produktions-HA/Failover und repräsentative Last.
HARDWARE_VALIDATION_PENDING: reale Strom-/Wasser-/Gas-/Wärmezähler, Gateways,
Modbus RTU/TCP, M-Bus, Wireless M-Bus, Pulse, LoRaWAN und Herstellergeräte.

Keine Production-Freigabe; kein Commit, Push, Tag oder Deployment. Der Commit
`Prepare Meterwerk v1.0 release candidate` ist nach Review empfohlen.
Die finalen Images bleiben dem bewerteten SHA zugeordnet. Secret-Scan-Scope:
gemergtes /app und ausgewählte Config-/History-Prüfungen, keine vollständige
Layerforensik. Web-Drain historisch 11,90 s; Shutdown-Fristen berücksichtigen.
Die Windows-Argon2-Hostbeschränkung ist kein Fehlschlag der geprüften Linux-Runtime.

Maßgeblich sind [finaler Bericht](acceptance/FINAL-RC-1E6589E.md) und
[finale Evidence](acceptance/FINAL-RC-1E6589E.json). Nachfolgende frühere Bewertungen
sind ausschließlich Historie und keine noch offenen aktuellen Blocker.

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
