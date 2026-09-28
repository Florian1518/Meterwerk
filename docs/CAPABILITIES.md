# Produktfähigkeiten und Validierungsstatus

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
