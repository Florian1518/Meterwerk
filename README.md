# Meterwerk

Phase 5A erweitert das bestehende System um ein gemeinsames Messgrößenmodell für Strom, Wasser, Gas und Wärme, Einheiten-Normalisierung, historische Tarife, profilabhängige Detailseiten und vier virtuelle Simulatoren. Start, API-Verträge, Demo und Grenzen: [Multi-Utility-Anleitung](docs/MULTI-UTILITY.md). Nach den Migrationen erzeugt `pnpm db:seed:utility` mit `SEED_DEMO=true` auf der lokalen Entwicklungsdatenbank den separaten Demo-Mandanten; `pnpm test:utility` prüft die neuen Datenbankzugriffe. Keine reale Hardware oder M-Bus-/wM-Bus-Anbindung wurde ergänzt.

Lauffähiges Smart-Metering-SaaS-Grundsystem mit Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL und Prisma. Deutsche Oberfläche, zwei Demo-Mandanten und serverseitiges Rollenmodell.

## Lokal starten

Voraussetzungen: Node.js 22.12+ (getestet mit 24.19), pnpm 11.19 und PostgreSQL 17. Für Entwicklung ist eine lokale PostgreSQL-Laufzeit als Dev-Dependency enthalten; Docker ist optional.

```sh
pnpm install --frozen-lockfile
```

Bei einer neuen Installation `.env.example` nach `.env` kopieren; eine vorhandene `.env` nicht überschreiben. `DATABASE_URL` für die lokale PostgreSQL-Datenbank `meterwerk` setzen, z. B. mit Benutzer `meterwerk`, Host `localhost` und Port `5432`. Ein eigenes Datenbankpasswort URL-kodiert in `DATABASE_URL` und unverändert in `POSTGRES_PASSWORD` eintragen. `DEMO_PASSWORD` selbst wählen (mindestens 14 Zeichen). Die Vorlage enthält keine Zugangsdaten. Bei bestehenden Datenbanken müssen die Werte den bereits eingerichteten Zugangsdaten entsprechen; sie ändern keine bestehenden Passwörter.

In Terminal 1 eine Datenbank starten:

```sh
pnpm db:local
```

Alternativ `docker compose up -d db`. Beide Varianten belegen Port 5432, daher nur eine starten. `db:local` bindet an 127.0.0.1 und speichert dauerhaft unter `.local/postgres`; Strg+C beendet den Prozess. Das eingebettete Paket ist ausschließlich ein Entwicklungswerkzeug, kein Produktionsdatenbankdienst.

In Terminal 2:

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Anwendung: [http://localhost:3000](http://localhost:3000).

In dieser Codex-Umgebung ist pnpm bei Bedarf über folgenden PowerShell-Aufruf erreichbar:

```powershell
& 'C:\Users\jmous\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' run dev
```

Für die anderen Befehle `run dev` durch z. B. `run db:local` ersetzen. Auf einer üblichen Node-/pnpm-Installation genügt die Kurzform oben.

## Demo-Anmeldung

Alle sieben Demo-Benutzer verwenden den beim ersten Seed gesetzten Wert von `DEMO_PASSWORD` aus der lokalen, nicht versionierten `.env`. Es gibt kein im Repository hinterlegtes Standardpasswort.

| Zugang                     | Rolle                         |
| -------------------------- | ----------------------------- |
| admin@meterwerk.demo       | SUPER_ADMIN                   |
| verwaltung@nordstern.demo  | TENANT_ADMIN                  |
| management@nordstern.demo  | MANAGER                       |
| user@nordstern.demo        | USER, nur Campus am Stadtpark |
| verwaltung@rheinblick.demo | TENANT_ADMIN                  |
| management@rheinblick.demo | MANAGER                       |
| user@rheinblick.demo       | USER, nur Rheinterrassen      |

Seed: 2 Kunden, 6 Liegenschaften, 6 Gebäude, 12 Nutzungseinheiten, 48 Zähler, aktuelle Stundenwerte und tägliche Werte des Vorjahresmonats. Bestehende Identitäten und Passwörter werden nicht überschrieben; erneutes Seeden überspringt vorhandene Messwerte. Der Seed ist für den initialen Demo-Aufbau, kein dauerhafter Messwertsimulator. Nicht gegen Produktionsdatenbanken ausführen.

## Bereits funktionsfähig

- Anmeldung, Logout, ablaufende und widerrufbare Sitzungen, Argon2id, persistente Login-Begrenzung.
- Mandantentrennung und USER-Freigaben auf Server-, Seiten- und API-Ebene; mandantentreue Datenbankbeziehungen.
- Dashboard mit Verbrauch heute/Monat/Vorjahresmonat, Demo-Kostenschätzung, 30-Tage-Diagramm, Liegenschaftsvergleich, Zählerarten, Geräte- und Alarmstatus.
- Alle neun angeforderten Bereiche: Dashboard, Kunden, Liegenschaften, Gebäude, Nutzungseinheiten, Zähler, Benutzer, Alarme, Einstellungen.
- Anlageformulare für Kunden und Stammdaten, Anlage von Benutzern, Liegenschaftsfreigaben für USER, Alarmbestätigung/-erledigung.
- Suchbare Tabellen, Zählerdetailansicht mit 48 Messwerten, Einheiten/Quellen/Qualität, Lade-/Leer-/Fehlerzustände.
- Sichere interne REST-Lesezugriffe, validierte Stammdaten-Schreibzugriffe und atomare AuditEvents.

Die Einstellungen zeigen den aktuellen Konfigurationsstand; sie sind noch kein editierbarer Systemeinstellungsbereich. Stammdaten haben zunächst Anlage-/Leseansichten, keine vollständigen Bearbeiten-/Löschen-Workflows. Manager können Dashboard-Auswertungen ansehen; gespeicherte Berichte und Exporte folgen später.

## Prüfungen

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:http
pnpm build
```

Integrationstests benötigen die migrierte, geseedete Demo-Datenbank. HTTP-Tests zusätzlich `pnpm dev` auf APP_URL. Sie erzeugen nur kurzlebige Testsitzungen und einen temporären Testdatensatz, die anschließend entfernt werden. Nicht auf echten Kundendaten ausführen.

Build/Start: `pnpm build`, dann `pnpm start`. In Produktion sind Cookies Secure; dort HTTPS und eine passende APP_URL konfigurieren. Für lokale Browserentwicklung `pnpm dev` verwenden.

## Aufbau

```text
src/app/                  Seiten, Layouts, Server Actions, API
src/components/           Shell, Tabellen, Formulare, Diagramm
src/components/ui/        shadcn/ui-Komponenten
src/server/               Auth, Policy, Datenzugriff, Mutationen, Auswertungen
src/generated/prisma/     Generierter Client (nicht eingecheckt)
prisma/                   Schema, SQL-Migrationen, Demo-Seed
scripts/                  Lokale Datenbank
tests/                    Policy-, PostgreSQL- und HTTP-Tests
docs/                     Architekturentscheidungen und Prüfprotokoll
AGENTS.md                 Regeln für Folgeaufgaben
```

## Interne API

`GET /api/{properties|buildings|units|meters|readings|alarms|users}` und `GET /api/meters/:id` benötigen eine gültige Sitzung. `GET /api/tenants` ist nur für SUPER_ADMIN. Für Plattformzugriff `?tenantId=...` ergänzen; Kunden können damit niemals in einen anderen Mandanten wechseln.

`POST /api/{tenants|properties|buildings|units|meters|users|grant|alarm}` akzeptiert die in `src/server/mutations.ts` definierten JSON-Felder, verlangt Verwaltungsrechte und einen Origin entsprechend APP_URL. Diese Schnittstelle ist eine interne Benutzer-API, noch keine Geräte-Ingestion-API. Listen sind auf 200 Datensätze begrenzt.

## Vorbereitet und nächste Schritte

REST-Ingestion und die lokale MQTT-/Modbus-Gateway-Kette sind in Phase 2 und 3 angeschlossen (siehe unten). Webhooks, Abrechnung, Tarifverwaltung, erweiterte Alarmberechnung, Versand und Benachrichtigungen sind geplant.

Vor kommerziellem Betrieb: Benutzerlebenszyklus/MFA, Deployment- und Backupkonzept, Monitoring, Datenbankrollen/RLS, Lasttests und unabhängige Sicherheitsprüfung ergänzen. Anschließend Geräte-Ingestion, skalierbare Aggregate und Abrechnung entwickeln. Details und Abgrenzungen: [Architektur](docs/ARCHITECTURE.md).

## Phase 2: REST-Ingestion und virtuelle Devices

Die Geräteebene trennt kaufmännischen `Meter`, digitales `Device` und optionales `Gateway`. Devices besitzen Mandant, Meter, externe ID, Hersteller, Firmware, Protokoll, Status und Zeitpunkte. REST-Device-Credentials sind separate 256-Bit-Tokens; nur SHA-256-Hashes werden gespeichert. Ein Token wird bei Ausstellung genau einmal zurückgegeben, Rotation widerruft aktive Vorgänger. Die MQTT-Gateway-Credentials aus Phase 3 verwenden separate Ed25519-Schlüssel.

`POST /api/v1/ingest/readings` verwendet `Authorization: Bearer <device-token>` und JSON:

```json
{
  "messageId": "abc-123",
  "timestamp": "2026-09-17T12:00:00Z",
  "value": 12853.42,
  "consumption": 2.38,
  "unit": "kWh",
  "quality": "VALID",
  "source": "REST"
}
```

`tenantId` und `meterId` werden niemals aus der Payload übernommen. Neue Messwerte liefern `201`, Duplikate mit derselben `messageId` idempotent `200`, Payloadfehler `400`, ungültige Credentials `401`, deaktivierte Devices `403`, Einheitenkonflikte `409`, übergroße Payloads `413` und über 120 Requests pro Credential/Minute `429`.

Virtuellen Simulator einmalig anlegen und Token anzeigen:

```powershell
pnpm virtual-meter --create
$env:VIRTUAL_DEVICE_TOKEN="mtr_..."
pnpm virtual-meter --once
pnpm virtual-meter
```

Der Simulator sendet ausschließlich über die Ingestion-API, standardmäßig alle 15 Minuten. `VIRTUAL_TENANT_ID` und `VIRTUAL_TYPE` (`ELECTRICITY`, `WATER`, `GAS`, `HEAT`) können gesetzt werden. Das Dashboard kennzeichnet REST-Werte als echte Ingestion-Daten und Demo-Werte separat.

### Phase 3: lokale Ende-zu-Ende-Umgebung

Die implementierte Kette verwendet echtes Modbus TCP und MQTT: Simulator → Edge-Agent → Mosquitto → separater Ingestion-Worker → PostgreSQL → Dashboard. Docker Desktop muss mit Linux-Containern laufen. `.env` muss auf die lokale Demo-Datenbank zeigen; `SEED_DEMO=true` und `DEMO_PASSWORD` sind für den ausdrücklich gestarteten Seed erforderlich.

```powershell
docker compose up -d --wait db mqtt
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm db:seed:edge
```

Danach in vier Terminals starten:

```powershell
pnpm dev
pnpm mqtt-worker
pnpm modbus-simulator
pnpm edge-gateway
```

| Dienst                              | Lokaler Port |
| ----------------------------------- | ------------ |
| Meterwerk Web                       | 3000         |
| PostgreSQL (Docker)                 | 5432         |
| MQTT TCP (Docker)                   | 1883         |
| MQTT WebSocket (Docker, reserviert) | 9001         |
| Modbus-TCP-Simulator                | 1502         |

Browser: <http://127.0.0.1:3000/dashboard>. Anmeldung: `verwaltung@nordstern.demo` mit dem beim ersten Seed gesetzten `DEMO_PASSWORD`. Demo-Gateway: `demo-edge-gateway`; Device: `demo-modbus-device`; Zähler: `MODBUS-DEMO-001` (kWh), im Campus am Stadtpark. Der zusätzliche Zähler ist von den bisherigen 48 Demo-Zählern getrennt.

Der Edge-Agent fragt alle zwei Sekunden Holding-Register 0–3 ab (uint64, Big Endian, Mikro-kWh). Der Simulator hält seinen Zählerstand unter `.local/modbus-energy.txt` über Neustarts hinweg. Die Queue liegt unter `.local/edge-queue.json`; nach einem Broker- oder Worker-Ausfall sendet der Agent dieselben Nachrichten-IDs erneut. Erst eine signierte Bestätigung nach dem PostgreSQL-Commit entfernt einen Eintrag. Datenbank-Constraints und transaktionale Verarbeitung verhindern doppelte Messwerte.

Gateway-Nachrichten sind mit Ed25519 signiert. Der Server prüft Credential-Status, Signatur einschließlich Topic, Gateway-ID, Mandant und Device-Zuordnung. Die privaten Schlüssel liegen ausschließlich im ignorierten `.local/`; die Datenbank hält den öffentlichen Gateway-Schlüssel. Vorhandene Schlüssel und Credentials werden beim Seed nicht rotiert oder überschrieben. Heartbeats melden die Gateway-Erreichbarkeit. Nach 15 Sekunden ohne aktuellen Kontakt setzt der Worker Gateway bzw. Device auf OFFLINE; historische Replay-Werte allein setzen ein Device nicht ONLINE. Das Dashboard fragt alle fünf Sekunden neue Serverdaten ab, solange der Tab sichtbar ist; alle Messzeitpunkte sind UTC.

Automatisierte Prüfung auf dieser lokalen Demo-Umgebung:

```powershell
pnpm test:gateway
# Web muss laufen; Worker, Simulator und Edge müssen zuvor beendet sein.
pnpm test:phase3
```

`test:phase3` startet diese drei Prozesse, stoppt/startet Simulator und MQTT gezielt und lässt die drei Prozesse bei Erfolg laufen. Ergebnisse und Prozess-IDs stehen in `.local/phase3-results.json` und `.local/phase3-processes.json`. Vor einem erneuten Lauf die vom Test gestarteten Prozesse unter Windows mit `node scripts/stop-phase3.mjs` beenden. Das Stoppskript prüft die Prozessidentitäten; Docker und Web laufen weiter. Es benötigt keine Änderung der PowerShell-Skriptrichtlinie. Ein weiterer Testlauf wird abgewiesen, solange die gespeicherten Prozesse noch laufen. Logs: `.local/{mqtt-worker,modbus-simulator,edge-gateway}.log`.

Grenzen der Entwicklungsumgebung: Mosquitto ist nur an Loopback veröffentlicht, intern aber anonym. Für Pilotbetrieb die separate Phase-4b-Konfiguration unten verwenden. Verteilter Worker-Betrieb ist nicht vorgesehen. Die automatische Browserdarstellung muss zusätzlich mit einem verbundenen Browser geprüft werden; der E2E-Test prüft die authentifiziert ausgelieferten Dashboard-Daten per HTTP.

### Phase 4a: Hardware-Readiness

Die Phase-3-Kette bleibt bestehen und unterstützt jetzt zentrale Modbus-Profile, TCP und serielles RTU, signierte Gateway-Steueraufträge und 14 technische Messgrößen. Ohne gespeicherte Modbus-Konfiguration bleibt der bisherige Demo-Poll aktiv; nach Konfiguration steuern die Einstellungen des Zählers das Gateway. Die Hardwarevorlage enthält absichtlich keine erfundenen Register und muss vor Verwendung anhand des Herstellerhandbuchs vervollständigt werden.

Nach `pnpm install --frozen-lockfile`, `pnpm db:generate` und `pnpm db:migrate` Web, Worker, Simulator und Edge starten. Als Administrator unter `/commissioning` den Demo-Zähler `MODBUS-DEMO-001` wählen. Profil „Simulator“ mit TCP 127.0.0.1:1502 / Unit 1 konfigurieren, Verbindung testen, Messwerte bestätigen, Nutzungseinheit bestätigen, Inbetriebnahme abschließen und Polling starten. Die Zählerdetailseite zeigt Live-Werte und CSV-Export; die Diagnose zusätzlich Auftragsergebnisse und administrative Rohdaten. Aktualisierung: fünf Sekunden bei sichtbarem Browser-Tab. Alle Messzeitpunkte und Exportzeiträume sind UTC.

```powershell
pnpm modbus:ports
pnpm modbus:fault TIMEOUT
pnpm modbus:fault NONE
# Lokale Demo, Web/Worker/Simulator/Edge müssen laufen:
pnpm test:modbus
```

Der Modbus-E2E-Test konfiguriert ausschließlich den lokalen Demo-Zähler, prüft Rechte, Inbetriebnahme, Live-Daten, CSV und simulierte Fehler/Wiederkehr. Er stellt am Ende NONE und aktives Polling wieder her; Ergebnisse: `.local/phase4a-results.json`. Weitere Fehlercodes: WRONG_SLAVE, DISCONNECTED, INVALID_REGISTER, UNREALISTIC, COMMUNICATION. Der Simulator liefert 14 Werte; ein TCP-Formatfehler abstrahiert Kommunikationsfehler, echte RTU-CRC-Prüfung findet im seriellen Transport statt.

Vollständige Arbeitsanleitung: [Hardware-Inbetriebnahme](docs/HARDWARE-COMMISSIONING.md). Autostart, Windows-Service, systemd, Pfade, Queue, Logs und manuelle Updates: [Gateway-Betrieb](docs/EDGE-GATEWAY-OPERATIONS.md). Noch offen: reale Register-/Verdrahtungsabnahme, physischer RTU-Test, Dienst-/Langzeittest auf dem Zielgerät und die genannten Produktionsmaßnahmen. Pro Gateway maximal 32 konfigurierte Geräte; Abfragen laufen seriell. Die tatsächliche Pollfrequenz hängt zusätzlich von Antwortzeiten, Gerätezahl und dem Agent-Arbeitszyklus ab.

### Phase 4b: Pilotbetrieb

Nach `pnpm db:migrate` und `pnpm db:generate` Web, Worker und Agent neu starten. Unter `/system-status` stehen Gateway-Anlage, einmalige Credential-Erstellung/Rotation/Widerruf, technische Health-Daten und deduplizierte Alarme bereit. Die bestehende Modbus-Inbetriebnahme bleibt unter `/commissioning` erhalten.

Pilot verwendet mTLS mit Zertifikatsprüfung und Gateway-ACLs; `compose.pilot.yaml` wird eigenständig mit eigenem Projektnamen gestartet. **Nicht** mit dem anonymen Entwicklungslistener kombinieren. Der Agent puffert maximal 10.000 Einträge/32 MiB/sieben Tage, mit Backoff, Warnungen und begrenzter Quarantäne. Bei erschöpfter Quarantäne werden Verluste gezählt und alarmiert.

- [Pilot-Installation, TLS/ACL, Credentials und Queue](docs/PILOT-INSTALLATION.md)
- [Backup und Wiederherstellung](docs/BACKUP-RESTORE.md)
- [Windows-/Linux-Dienstbetrieb](docs/EDGE-GATEWAY-OPERATIONS.md)

Neue Prüfungen: `pnpm test:pilot` auf laufender lokaler Demo sowie `pnpm test:mqtt-tls` auf einem getrennten Testbroker. Für TLS-Tests einmalig `scripts/test-mqtt-certificates.py` mit Python und cryptography ausführen, dann `docker compose -p meterwerk-pilot-test -f compose.pilot.yaml up -d`. Die Testzertifikate sind kurzlebig, lokal ignoriert und nicht für Pilotstandorte geeignet. Backup-Beispiel: `pnpm db:backup backup .local/backups/pilot.dump`, danach `verify` und `restore` gemäß Dokumentation.

Noch standortspezifisch abzunehmen: reale Register/RS485, Zertifikats-/CRL-Verteilung, Dienstkonto und Neustart, Firewall, Überwachung durch einen zuständigen Betreiber, externe verschlüsselte Sicherung, Restore, Last-/Langzeittest und Browser-Bedienung. Keine automatische Cloud-, Update- oder Nachrichteninfrastruktur ist hinzugekommen.
