# Meterwerk Edge Gateway

Der Agent läuft getrennt vom Webserver und greift nie direkt auf PostgreSQL zu. Er liest MeterDriver, puffert Nachrichten lokal und übergibt sie an einen MQTT- oder REST-Transport.

## Komponenten

- `src/types.ts`: Gateway- und Messwertverträge
- `src/queue.ts`: persistente Store-and-forward-Queue
- `src/modbus.ts`: frühere virtuelle Treiber für Unit-Tests
- `src/tcp-modbus.ts`: echter Modbus-TCP-Client für Holding-Register 0–3 (uint64 Mikro-kWh)
- `src/mqtt.ts`: versionierte Topics und injizierbarer Transport für Unit-Tests
- `src/wire.ts`: Ed25519-Signaturvertrag für Nachrichten und Commit-Bestätigungen
- `src/cli.ts`: dauerhafter Modbus-/MQTT-Prozess mit Heartbeats und Queue-Replay
- `src/agent.ts`: injizierbarer Agent für die ursprünglichen Unit-Tests

Start: zunächst `pnpm db:seed:edge`, danach `pnpm mqtt-worker`, `pnpm modbus-simulator` und `pnpm edge-gateway` jeweils getrennt starten. Die vollständige Konfiguration, Ports, Testbefehle und Grenzen stehen in der Projekt-README. Der ausführbare Agent löscht Queue-Einträge ausschließlich nach einer verifizierten Datenbank-Commit-Bestätigung. Private Schlüssel, Queue und Simulatorstand liegen im ignorierten `.local/`.
