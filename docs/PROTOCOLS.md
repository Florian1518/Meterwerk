# Protokolle Phase 5b

Die zentrale Kette lautet: Protokolladapter → normalisierte Messung → authentifizierte zentrale Ingestion → Zod-/Einheitenprüfung → Prisma Reading/Measurement + AuditEvent → Aggregation und Alarme. Device-Credentials bestimmen Mandant und Gerät; Payloads dürfen diese Identität nicht überschreiben. Duplicate `messageId`, historische Werte und Replays bleiben idempotent bzw. qualitätsmarkiert.

| Protokoll               | Stand                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| MODBUS_TCP / MODBUS_RTU | Vorhandener Treiber, Gateway, Profil- und Queue-Pfad; Simulator vorhanden; reale Hardware ungeprüft                                       |
| MBUS                    | Konfigurationsvertrag, Telegrammdecoder, Capability-/Simulatorpfad; keine serielle Hardware                                               |
| WMBUS                   | OMS/T/C/S-Konfiguration, Signal-/Framecounter-Datenmodell, Decoder und Simulator; AES-Key nur als Credential-Referenz; keine Funkhardware |
| PULSE                   | Faktor-, Debounce-, Rollover- und Kanalmodell, Decimal-Berechnung für Verbrauch und Durchfluss/Leistung, Simulator                        |
| LORAWAN                 | Network-Server-Webhookvertrag mit DevEUI, RSSI, SNR, Frame Counter und austauschbarem Decoder; keine eigene Netzwerkinfrastruktur         |
| REST / MQTT             | Vorhandene authentifizierte REST-/signierte MQTT-Pfade; neue normalisierte Adapterverträge                                                |
| VENDOR_API              | Austauschbares Mapping-/Polling-/Event-/Rate-Limit-Profil, kein Herstelleradapter                                                         |

M-Bus benötigt Primary/Secondary Address, Baudrate, Port, Herstellerkennung und Medium. wM-Bus speichert Device-ID, Hersteller, Modus und Security Mode; geheime Schlüssel werden nur über `encryptionKeyRef` referenziert und nie in Repository oder Logs geschrieben. Die Protokollkonfiguration wird strikt mit `protocolConfigSchema` validiert.

`MeterDriver` stellt `connect`, `disconnect`, `read`, `health`, `testConnection` und `getCapabilities` bereit. Capabilities enthalten Utility, Protokoll, Messgrößen, Polling/Event, Bidirektionalität sowie optionale Geräteidentität. Profile sind mandantenbezogen, versioniert und unveränderlich pro Hersteller/Modell/Version; historische Readings referenzieren keine veränderbare Profilversion.

Die Browser-Inbetriebnahme zeigt den vorhandenen Modbus-Assistenten weiter; der Capability-Endpunkt `/api/devices/:id/capability` liefert die protokollabhängigen Daten. Ein vollständiger neuer Wizard für alle externen Protokolle bleibt vorbereitete API-/Profilinfrastruktur, solange kein konkreter Hardwarevertrag vorliegt.

Die Auswahlreihenfolge im Inbetriebnahmeprozess ist damit fachlich festgelegt: Utility → Protokoll → versioniertes Device Profile → protokollspezifische Parameter → Testverbindung/Testtelegramm → erkannte Messgrößen → Zuordnung → Aktivierung. Der vorhandene Modbus-Schritt bleibt rückwärtskompatibel und bildet die erste konkrete Ausprägung dieses Ablaufs.

Keine Herstellerhardware, keine M-Bus-/wM-Bus-Schlüssel und keine echte LoRaWAN-/Vendor-API-Verbindung sind Teil dieser Phase.

## Teststand Phase 5b

Die Adapter-Unit-Suite umfasst Decoder, Pulse-Rollover, Profile, Capability-Verträge und alle virtuellen Treiber. Der lokale End-to-End-Test sendet fünf normalisierte Pfade durch Device-Credential, zentrale Ingestion, PostgreSQL und Duplicate-Erkennung. Der reproduzierbare Adapterlastmodus unterstützt `PROTOCOL_LOAD_DEVICES=100` oder `1000`; er misst derzeit nur Decoder/Driver und weist DB-Schreiblast ausdrücklich als offen aus. Ein Lauf mit 1.000 Devices und 96.000 Werten erreichte 180.885 Werte/s, 0 Fehler und 0 Queue-Backlog.

Die vorhandenen Phase-3-/4b-Transportprüfungen bleiben die Abnahme für signiertes MQTT, persistente Queue und Modbus TCP. Ein Docker-/MQTT-Broker sowie reale Browserautomatisierung müssen für die vollständigen Transport- und Browser-E2E-Suiten verfügbar sein; sie werden nicht durch Adaptertests ersetzt.
