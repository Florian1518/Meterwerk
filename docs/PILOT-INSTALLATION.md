# Pilot-Installation

Phase 4b ergänzt den bestehenden Webserver, PostgreSQL, MQTT-Worker und Edge-Agenten. Keine neue Microservice-Schicht. Die lokale Demo bleibt auf MQTT-Port 1883; der Pilot verwendet einen separaten TLS-Broker. Noch keine Herstellerhardware ist mit dieser Installation abgenommen.

## Ablauf am Standort

1. **Gateway-PC vorbereiten:** Unterstütztes Windows/Linux, Node ≥22.12, pnpm, RS485-Treiber, stabile Uhrzeitsynchronisierung und gesicherte Netzwerkverbindung bereitstellen. Dediziertes Dienstkonto und restriktive Dateirechte verwenden.
2. **Agent installieren:** Geprüften Commit bereitstellen, `pnpm install --frozen-lockfile`; native SerialPort-Bindings auf dem Zielsystem installieren. `pnpm edge-gateway --version` zeigt die Agent-Version. Installationspfad und persistentes Datenverzeichnis trennen.
3. **Gateway anlegen:** Als TENANT_ADMIN unter `/system-status` Name und Standortkennung eingeben. SUPER_ADMIN wählt explizit einen Mandanten. Die erzeugte interne Gateway-ID ist die Identität für MQTT, Zertifikat und Agent; nicht die frei gewählte Standortkennung.
4. **Credential erzeugen:** Gateway auswählen, optionales Ablaufdatum setzen und Credential erstellen. Die Anzeige liefert Credential-ID und privaten Ed25519-Schlüssel einmalig. Auf dem Gateway geschützt speichern; danach Anzeige schließen. Ein erneutes GET liefert ausschließlich Metadaten.
5. **Lokal hinterlegen:** `EDGE_CONFIG_PATH` auf die geschützte Konfiguration setzen. `gatewayId`, `credentialId`, `privateKeyPath`, `receiptPublicKeyPath`, `dataDirectory` und Endpunktfreigaben eintragen. `deviceId` nach der Gerätezuordnung übernehmen. Im Pilot kein unkonfiguriertes Gerät betreiben. Den öffentlichen Receipt-Schlüssel über einen vertrauenswürdigen Kanal verteilen.
6. **RS485 anschließen:** Elektrofachkraft, Gerätehandbuch und [Hardware-Inbetriebnahme](HARDWARE-COMMISSIONING.md) beachten. A/B, Bezugspotenzial und Terminierung prüfen.
7. **COM-Port prüfen:** `pnpm modbus:ports` direkt am Gateway ausführen. Port ausdrücklich in `allowedSerialPorts` freigeben; für TCP entsprechend `allowedTcpEndpoints`.
8. **Profil auswählen:** In `/commissioning` Zähler anlegen/auswählen und zuordnen. Hardwarevorlage anhand Herstellerhandbuch vervollständigen und freigeben. Simulatorprofile nicht auf reale Geräte anwenden.
9. **Verbindung testen:** Schnittstellenparameter speichern, Verbindungstest ausführen und tatsächliches Gateway-Ergebnis abwarten.
10. **Messwerte prüfen:** Einmalig lesen, Skalierung und Richtung mit Zähleranzeige vergleichen, Werte und Nutzungseinheit bestätigen.
11. **MQTT prüfen:** Folgende TLS-/ACL-Konfiguration verwenden; Systemstatus, Queue, aktuelle Daten und kontrollierte Wiederverbindung prüfen.
12. **Standort aktivieren:** Inbetriebnahme abschließen, Polling starten, Dienstautostart und Neustart testen. Technische Alarme, Backup/Restore und Verantwortlichkeiten abnehmen. ACTIVE allein startet kein Polling.

## MQTT TLS und ACL

Pilot setzt `METERWERK_ENV=pilot` (oder `NODE_ENV=production`), `MQTT_BROKER_URL=mqtts://broker.example:8883`, `MQTT_CA_PATH`, `MQTT_CERT_PATH` und `MQTT_KEY_PATH`. Zertifikats-/Hostnamenprüfung ist immer aktiv; unsicheres `NODE_TLS_REJECT_UNAUTHORIZED=0` wird im Pilot abgewiesen. Mindestversion TLS 1.2. Ohne eigene CA-Datei wird der System-Truststore verwendet. Zugangsdaten in der Broker-URL sind verboten.

Der Broker verlangt **gegenseitiges TLS**. Eine kontrollierte CA stellt pro Gateway ein Clientzertifikat aus, dessen CN exakt der internen Gateway-ID entspricht. Nur der Worker erhält den reservierten CN `meterwerk-ingestion`. Niemals dieselbe Identität zweimal verteilen oder Gateway-Betreibern freie CN-Auswahl beim Signieren erlauben. Serverzertifikat muss den Brokerhost im SAN enthalten; Clientzertifikate brauchen Client-Auth-Verwendung. Zertifikate und CRL rechtzeitig erneuern und Änderungen am Broker wirksam laden; widerrufene bestehende Verbindungen gezielt trennen bzw. Broker kontrolliert neu starten.

`compose.pilot.yaml` ist eine **eigenständige** Broker-Konfiguration, kein Overlay für den anonymen Entwicklungslistener:

```powershell
docker compose -p meterwerk-pilot -f compose.pilot.yaml up -d
```

Unter `.local/pilot-mqtt/` auf dem Broker liegen `ca.crt`, `server.crt`, `server.key`, `ca.crl`; nur das Brokerkonto darf den privaten Schlüssel lesen. Für andere Installationspfade die Mounts anpassen. Port 8883 nur für berechtigte Netze öffnen. Den Entwicklungsbroker nicht zusätzlich öffentlich veröffentlichen.

Die ACL in `infra/mosquitto/pilot.acl` verwendet den **zertifikatsgeprüften CN** als `%u`, nicht Client-ID oder frei gesetzten Benutzernamen. Gateways schreiben ausschließlich ihre eigenen readings/heartbeat/telemetry/control/status/events-Topics und lesen nur ihre eigenen ack/configuration-Topics. status/events sind reserviert, kein zusätzlicher Ingestion-Vertrag. Der Worker liest die vier implementierten Eingangstypen und schreibt Bestätigungen/Konfiguration. Mosquitto kann eine Subscription annehmen, aber die fremde Nachrichtenzustellung trotzdem sperren. Die Ingestion prüft zusätzlich Signatur, Credential, Gateway, Device und Mandant. Grundlage: [Mosquitto-Konfiguration](https://mosquitto.org/man/mosquitto-conf-5.html).

Worker: eigene TLS-Dateien, `MQTT_RECEIPT_KEY_PATH` für den privaten Receipt-Schlüssel. Webserver und Edge benötigen diesen privaten Receipt-Schlüssel nicht. Keine geheimen Dateien ins Release oder Git aufnehmen.

## Credential-Lebenszyklus

Die bestehende Ed25519-Architektur bleibt bestehen. Es gibt kein auf dem Server gespeichertes Gateway-Passwort: gespeichert werden öffentlicher Verifikationsschlüssel und SHA-256-Fingerprint sowie createdAt, lastUsedAt, expiresAt und revokedAt. Der private Schlüssel ist nach der Erstellung/Rotation nur in der einmaligen POST-Antwort verfügbar, mit `private, no-store`; Listen, Audit und Logs enthalten ihn nicht. Ein Passwort-Hash wäre für diesen asymmetrischen Signaturvertrag kein Ersatz.

Rotation erzeugt ein neues Schlüsselpaar und widerruft den ausgewählten Vorgänger atomar. Den neuen privaten Schlüssel und die Credential-ID lokal ersetzen und den Agenten neu starten; bis dahin schlagen Nachrichten fehl und verbleiben in der begrenzten Queue. Bei Verlust der einmaligen Anzeige ein neues Credential erzeugen und das verlorene widerrufen. Widerruf/Ablauf verhindert serverseitige Ingestion sofort. **Broker-Zertifikate sind ein separater Lebenszyklus:** bei kompromittiertem Gerät zusätzlich Clientzertifikat per CRL widerrufen und bestehende MQTT-Verbindung trennen. Rotation eines Signaturschlüssels ersetzt kein TLS-Zertifikat.

## Queue, Retry und Quarantäne

Standardwerte: 10.000 aktive Einträge, 32 MiB serialisierte Nutzdaten, sieben Tage Alter, Warnung ab 1.000 Einträgen oder 80 % Bytes. `queueLimits` im lokalen Agent-JSON kann alle sechs Werte `maxItems`, `maxBytes`, `maxAgeMs`, `warningItems`, `maxAttempts`, `quarantineItems` ersetzen (positive Ganzzahlen).

Bei Kapazitätsüberschreitung wird der **neue** Eintrag in Quarantäne gestellt; vorhandene Daten bleiben priorisiert. Abgelaufene Einträge gehen ebenfalls dorthin. Fehlgeschlagene Zustellung wartet exponentiell 1/2/4/… Sekunden, maximal 60 Sekunden. Versuche bleiben über Neustarts erhalten. Nach standardmäßig 50 erfolglosen Sendeversuchen wird die Nachricht als RETRY_EXHAUSTED quarantänisiert; reine Broker-Offline-Zeit ohne Sendeversuch verbraucht keine Versuche. Spätere Einträge können fortschreiten, je Arbeitszyklus maximal 50.

Quarantäne liegt zusammen mit Retry-Metadaten in `edge-queue.json.state`, maximal 500 Einträge und zusätzlich 32 MiB, ebenfalls sieben Tage. Überschreitungen verwerfen die ältesten Quarantäneeinträge und erhöhen einen dauerhaften Verlustzähler. Damit sind Speicherverbrauch und Aufbewahrung begrenzt; **unbegrenzte Verlustfreiheit bei langem Ausfall wird nicht versprochen**. Datenverzeichnis und Sicherungen schützen. Warnungen unverzüglich bearbeiten.

Quarantäne enthält Nachricht, Grund und Zeitpunkt, keine Gateway-Schlüssel. Agent stoppen, Datei sichern, Ursache beheben und Einträge fachlich prüfen. Keine automatische Endlosschleife zurück in die Queue. Kontrollierte Wiederaufnahme mit unveränderter messageId ist ein administrativer Wartungsschritt; dafür gibt es noch keinen Browser-Editor. Niemals gleichzeitig an Queue-Dateien und laufendem Agent arbeiten. Datenbank-Commit-Bestätigung bleibt Voraussetzung zum Entfernen erfolgreicher Nachrichten.

## Monitoring, Alarme und Logs

`/system-status` und `/api/system/health?tenantId=...` sind ausschließlich für Administratoren; Mandantenfilter gelten für alle Daten. Die Seite aktualisiert alle fünf Sekunden. Sie zeigt PostgreSQL-Erreichbarkeit, MQTT-/Worker-Heartbeat, Gateway-Heartbeat/Version/Queue, Geräte-Poll/letzte Messung/Fehlerrate und offene technische Alarme. Datenbankausfall liefert einen Fehler statt Demo-Ersatz; die Oberfläche kennzeichnet den Status dann als unbekannt. Der API-Endpunkt liefert bei authentifiziertem Zugriff Statusdaten; der Überwacher muss die Felder mqtt/ingestion zusätzlich zum HTTP-Code auswerten.

Der vorhandene Worker aktualisiert seine Betriebsdaten alle zwei Sekunden. Nach 30 Sekunden ohne Worker-Heartbeat gilt Ingestion als ausgefallen. Gateway-Alarm nach 30 Sekunden; Device-Schwelle berücksichtigt Modbus-Pollintervall und Timeout. Modbus-/ungültige Werte nach drei aufeinanderfolgenden Fehlern; Ingestion-Fehler nach drei Ablehnungen innerhalb einer Fehlerphase mit maximal 60 Sekunden Ruhe zum Zurücksetzen. MQTT-Alarm nach zehn Sekunden bestätigter Unterbrechung; deren Beginn wird in PostgreSQL gespeichert, damit Web und Worker denselben Zustand bewerten. Queue-Alarm bei Warnschwelle, Quarantäne oder registriertem Verlust.

Pro Mandant, Typ und Objekt existiert ein Alarmzustand; wiederholte Beobachtungen erzeugen keine neuen Alarme. Erholung löst den Alarm, erneutes Auftreten erhöht den Zähler. Es werden keine E-Mails/SMS versendet. Bei gestopptem Worker wertet auch die Systemstatusabfrage Zustände aus; für unbeaufsichtigten Betrieb eine externe, authentifizierte Health-Abfrage/Überwachung vorsehen. Ein vollständig ausgefallener Host kann sich nicht selbst alarmieren.

Agent und Worker schreiben JSON nach stdout: timestamp, level, service, event und verfügbare IDs/Zähler. `LOG_LEVEL=DEBUG|INFO|WARN|ERROR`, Standard INFO. Felder werden explizit freigegeben; keine Error-Objekte, Payloads, Passwörter, URLs mit Zugangsdaten oder Schlüssel protokollieren. Dienstmanager übernimmt Logpfad/Rotation. Die Fehlerrate im UI ist kumulativ seit Diagnosebeginn, keine gleitende statistische Rate.

## Betrieb und Abnahme

[Windows-/Linux-Dienstbetrieb](EDGE-GATEWAY-OPERATIONS.md) beschreibt Autostart, Neustart bei Absturz, Pfade und kontrollierte Updates. [Backup/Restore](BACKUP-RESTORE.md) muss auf dem Zielsystem praktisch abgenommen werden. Vor Pilotstart: echtes Profil/RS485, Ziel-PC-Neustart, Zertifikatsverteilung/CRL, Firewall, Alarmverantwortlicher, Platten-/Queue-Grenzen, Backup außerhalb des Hosts und Restore-Test. Lokale Testzertifikate aus `scripts/test-mqtt-certificates.py` sind ausschließlich für automatisierte Tests bestimmt und laufen nach einem Tag ab.
