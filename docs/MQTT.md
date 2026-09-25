# MQTT-Betrieb

Der MQTT-Worker nimmt signierte Gateway-Nachrichten entgegen. MQTT-Broker und Gerätezugang sind getrennte Vertrauensbereiche. Die Produktions-Compose-Datei stellt einen internen Broker bereit; Broker-TLS/ACL und externe Gateway-Anbindung müssen für das Zielsystem passend eingerichtet und geprüft werden.

## Topics und Nachrichten

Gateway-Publish-Pfade im Code verwenden `meterwerk/v1/gateways/{encodedGatewayId}/readings` und `/heartbeat`. Der Server-Worker verarbeitet außerdem `/telemetry` und `/control`; der Edge-Agent lauscht auf `/ack` und `/configuration`. `/status` und `/events` sind derzeit kein vertraglich verarbeiteter Ingestion-Pfad. Topic-Namen sind kein Berechtigungsnachweis: Credential, Signatur, Tenant-/Gateway-Zuordnung und Schema werden serverseitig geprüft.

## Betrieb

`pnpm mqtt-worker` startet den kombinierten MQTT-Ingestion-/Webhook-Outbox-Prozess; er benötigt Datenbank- und Brokerkonfiguration. `MQTT_BROKER_URL` ist der vom Worker verwendete Broker-Endpunkt. Broker-Zugangsdaten und Gateway-Credentials getrennt, minimal berechtigt und außerhalb des Repositories verwalten. Für reale Installationen TLS-Zertifikate und ACL so konfigurieren, dass Gateways nur eigene Topics nutzen.

Der Edge-Agent puffert Messungen lokal, sendet dieselbe Message-ID bei Wiederholung und entfernt sie erst nach signierter Serverbestätigung nach Datenbank-Commit. Backoff begrenzt Wiederverbindungen. Queue-Größe und Aufbewahrung sind lokal konfiguriert; dauerhaftes Offlineverhalten und Hardwarekompatibilität müssen am Zielgateway validiert werden.

## Diagnose

Broker erreichbar? Worker-Heartbeat aktuell? Topic/encoded Gateway-ID korrekt? Credential aktiv und Signatur gültig? Queue-Backlog bzw. Quarantäne prüfen. Danach DB-Ingestion, Idempotenz-ID und Gateway-Health untersuchen. Keine Credentials oder vollständigen signierten Payloads in Logs kopieren. Bei langen Ausfällen [Edge Gateway](EDGE-GATEWAY-OPERATIONS.md) und [Troubleshooting](TROUBLESHOOTING.md) verwenden.
