# Hardware-Inbetriebnahme: dreiphasiger Modbus-Zähler

Phase 4a stellt die Software bereit. Das vorbereitete Hardwareprofil ist bewusst **nicht freigegeben**: Herstellerregister werden erst anhand des Handbuchs des tatsächlich gelieferten Modells eingetragen. Der Simulator ersetzt keinen elektrischen Abnahmetest.

## 1. Anschluss vorbereiten

Netzseitige Arbeiten ausschließlich durch eine Elektrofachkraft, spannungsfrei und nach Herstelleranleitung. Für RS485 ein geeignetes verdrilltes A/B-Adernpaar verwenden. Die A/B-Bezeichnungen verschiedener Hersteller können abweichen: die Anschlussbelegung beider Geräte anhand ihrer Handbücher zuordnen. Bezugspotenzial, Schirm und galvanische Trennung nach den Geräte- und Anlagenvorgaben ausführen.

Den Bus als Linie aufbauen; lange Stichleitungen vermeiden. Abschlusswiderstände gehören an die beiden physikalischen Busenden, passend zur Leitungsimpedanz, häufig 120 Ω. Bereits eingebaute Terminierung berücksichtigen. Nicht jeden Teilnehmer zusätzlich terminieren. Grundlage: [TI zur RS485-Terminierung](https://www.ti.com/document-viewer/lit/html/SSZTB23A/GUID-B7704918-202D-4557-B6E0-F0BB82D05C97).

## 2. Geräteparameter und Profil

Baudrate, Parity und Stop Bits müssen auf Zähler und Gateway übereinstimmen. 9600 und 19200 Baud sind typische Ausgangspunkte; verbindlich ist die Geräteeinstellung. RTU verwendet acht Datenbits. Slave-ID 1–247 eindeutig je Bus vergeben; Broadcast-ID 0 ist zum Lesen nicht erlaubt. Bei TCP Host, Port und Unit-ID aus der Geräte-/Bridge-Konfiguration übernehmen.

Zentrale Profile liegen unter `src/lib/modbus/profiles/`. `three-phase-template.json` enthält alle 14 Messgrößen, aber absichtlich keine Registeradressen. Für das gelieferte Modell Hersteller, Modell, Standardparameter, Adressen, Funktion 3/4, Datentyp, Registerlänge, Byte-/Word-Order, Skalierung, Einheit und plausible Grenzen anhand des Handbuchs eintragen. Adressen sind **nullbasierte Protokolladressen**; Handbuchnotationen wie 40001 nicht ungeprüft übernehmen. Erst nach Prüfung `verified: true` setzen. Profile sind versionierte Softwaredateien; neue Dateien im zentralen Profilregister in `contracts.ts` aufnehmen und ausrollen.

Unterstützt sind uint/int16, 32 und 64 sowie float32/64, jeweils Big-/Little-Endian für Bytes und Wörter. Proprietäre Kodierungen wie BCD sind nicht automatisch abgedeckt. Die Hardwarevorlage darf vor ihrer Verifizierung keine Verbindung starten. Nach Profiländerungen Konfiguration im UI erneut speichern: so entsteht eine neue Revision mit überprüfbarem Profilsnapshot.

## 3. Gateway und COM-Port

USB-RS485-Treiber installieren. Unter Windows den Geräte-Manager → Anschlüsse prüfen, z. B. COM3. Unter Linux möglichst einen stabilen `/dev/serial/by-id/...`-Pfad verwenden und dem Dienstkonto Zugriff geben. Direkt **auf dem Gateway-Rechner** zeigt `pnpm modbus:ports` die verfügbaren seriellen Ports; der Webserver kann entfernte COM-Ports nicht auflisten.

In der lokalen Gateway-Konfiguration `allowedSerialPorts` bzw. `allowedTcpEndpoints` ausdrücklich freigeben. Ohne diese Freigabe meldet die Diagnose ENDPOINT_NOT_ALLOWED. Gateway-Credentials und Receipt-Public-Key bereitstellen; private Schlüssel weder im Browser noch im Repository ablegen. Betriebsdetails: [Gateway-Betrieb](EDGE-GATEWAY-OPERATIONS.md).

## 4. Technikerablauf im UI

Als Mandantenadministrator `/commissioning` öffnen; SUPER_ADMIN wählt ausdrücklich einen Mandanten. Einen vorhandenen Zähler öffnen oder über die Zählerverwaltung anlegen. Auf dessen Diagnose-/Inbetriebnahmeseite:

1. Gateway auswählen.
2. Den ausgewählten kWh-Stromzähler prüfen bzw. wechseln/anlegen.
3. Das verifizierte Modbus-Profil auswählen.
4. RTU mit COM-Port oder TCP mit Host/Port wählen.
5. Baudrate, Parity, Stop Bits, Slave-/Unit-ID, Timeout und Polling-Intervall einstellen und speichern.
6. **Verbindung testen**: Ergebnis des tatsächlich ausgeführten Gateway-Auftrags abwarten.
7. **Einmalig lesen** und Messwerte gegen Zähleranzeige/Referenz prüfen; anschließend bestätigen.
8. Nutzungseinheit auswählen und bestätigen. Zähler mit Historie können nicht in eine andere Nutzungseinheit verschoben werden.
9. Inbetriebnahme abschließen und **Polling starten**. Abschluss allein startet kein Polling.

Ohne Konfiguration gilt NOT_CONFIGURED; nach Speichern COMMISSIONING, nach bestätigter Messung/Zuordnung ACTIVE. Fehler setzen FAULT, eine erfolgreiche Messung stellt den vorherigen abgeschlossenen Betrieb wieder her. DISABLED sperrt das Gerät bis zur Neukonfiguration. Konfigurationsänderungen erfordern eine erneute Bestätigung.

## 5. Erste Messung, MQTT und Dashboard

Zuerst Spannungen, Ströme, Leistungen, Frequenz und Leistungsfaktor auf Plausibilität prüfen. Import-/Exportenergie mit der Geräteanzeige vergleichen; Skalierung und Energierichtung kontrollieren. Gateway und separater MQTT-Worker müssen laufen. ONLINE bedeutet aktuellen Kontakt, nicht bloß gespeicherte historische Daten.

Die Zählerdetailseite aktualisiert technische Werte alle fünf Sekunden, solange der Tab sichtbar ist. Messzeitpunkte sind UTC. Die Diagnose zeigt letzten Poll, Erfolg, Laufzeit, Fehler, Zählerstände der erfolgreichen/fehlerhaften Reads, Verbindung und Profil. Nur Administratoren sehen die begrenzten letzten Rohregister. CSV: Zählerdetail → Zeitraum und Messgröße → Export; maximal 31 Tage und 10.000 Zeilen, UTC, mit Einheit.

MQTT kurz kontrolliert unterbrechen: lokale Queue muss wachsen und nach Rückkehr abgearbeitet werden. Einträge verschwinden erst nach signierter Datenbank-Commit-Bestätigung. Danach Dashboard und Zeitreihe auf Lücken/Duplikate prüfen. Diesen Test zunächst in der lokalen Testumgebung durchführen.

## 6. Fehler eingrenzen

| Meldung / Beobachtung   | Prüfung                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| TIMEOUT / keine Antwort | Stromversorgung, A/B-Zuordnung, Port, Slave-ID, Baudrate/Parity, Terminierung |
| WRONG_SLAVE             | Antwort passt nicht zur angefragten Slave-/Unit-ID                            |
| INVALID_REGISTER        | Nullbasierte Adresse, Funktion 3/4, Länge und Firmware-Handbuch               |
| CRC / COMMUNICATION     | Leitungsqualität, serielle Parameter, Adapter und Antwortformat               |
| UNREALISTIC             | Datentyp, Skalierung, Byte-/Word-Order und Profilgrenzen                      |
| DISCONNECTED            | Kabel, Adapter, TCP-Erreichbarkeit und Dienststatus                           |
| ENDPOINT_NOT_ALLOWED    | Lokale Gateway-Freigabeliste                                                  |
| Daten bleiben alt       | Polling aktiv? MQTT-Worker erreichbar? Queue/Logs und UTC-Systemzeit prüfen   |

Einzelne Lesefehler ergeben WARNING; wiederholte Fehler oder Verbindungsabbruch OFFLINE. Erfolgreiche neue Polls stellen ONLINE wieder her. Alte Replay-Werte dürfen keinen aktuellen ONLINE-Status vortäuschen.

## 7. Simulator und Abnahmeprotokoll

`pnpm modbus:fault TIMEOUT` aktiviert einen Fehler ohne Simulatorneustart. Weitere Werte: WRONG_SLAVE, DISCONNECTED, INVALID_REGISTER, UNREALISTIC, COMMUNICATION. `pnpm modbus:fault NONE` stellt die Verbindung wieder her. COMMUNICATION simuliert ein fehlerhaftes TCP-Antwortformat; TCP besitzt keine RTU-CRC. RTU-CRC wird separat durch Frame-Tests geprüft.

Bei Lieferung dokumentieren: Modell/Firmware/Seriennummer, Handbuchversion, überprüfte Register, Verdrahtung und Busenden, Adapter/Treiber, Schnittstellenparameter, Vergleichsmessungen, Fehler-/Wiederanlauftest und zuständigen Techniker. Reale RTU-Hardware, Langzeittest und Dienstbetrieb auf dem Zielgerät bleiben Bestandteil dieser Abnahme.

Protokollreferenz: [offizielle Modbus-Spezifikationen](https://www.modbus.org/modbus-specifications).
