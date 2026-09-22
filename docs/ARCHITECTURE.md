# Architektur und Anforderungen

## Ziel und Umfang des Grundsystems

Meterwerk ist eine zentral betriebene B2B-Smart-Metering-Plattform. Ein Betreiber verwaltet Kunden; Kunden verwalten ihre eigenen Immobilien, Benutzer und Zähler. Die erste Ausbaustufe stellt ein funktionierendes, datenbankgestütztes Grundsystem mit Demo-Daten bereit. Sie ist noch keine freigegebene Produktionsinstallation.

Erfasste Anforderungen: Plattform → Mandant → Liegenschaft → Gebäude → Nutzungseinheit → Zähler → Messwerte; Strom, Wasser, Gas, Wärme; vier Rollen; gesicherte Serverzugriffe; Dashboard; neun Verwaltungsbereiche; spätere Integrationen.

## ADR 001: Modularer Monolith

Next.js 16 App Router mit React 19 und TypeScript strict. Server Components lesen über eine gemeinsame Serviceschicht. Server Actions bedienen Formulare, Route Handlers die interne REST-Schnittstelle. PostgreSQL 17 und Prisma 7 einschließlich pg-Adapter speichern alle fachlichen Daten. Tailwind CSS 4 und lokale shadcn/ui-Bausteine bilden die Oberfläche.

Der Monolith reduziert Betriebsaufwand und verhindert doppelte Berechtigungslogik. MQTT-Verarbeitung, große Importe und Benachrichtigungen sollen später als Worker ergänzt werden, ohne dass das Frontend oder Domänenmodell in Microservices zerlegt werden muss.

Die installierten Versionen sind im pnpm-Lockfile fixiert. Produktiv immer `pnpm install --frozen-lockfile` verwenden.

## ADR 002: Mandantentrennung

Shared Database / Shared Schema. Alle fachlichen Tabellen besitzen tenantId. Zusammengesetzte Unique-Keys `(id, tenantId)` und Fremdschlüssel verhindern, dass etwa ein Gebäude auf eine Liegenschaft eines anderen Mandanten verweist. Zusätzliche SQL-Constraints sichern Rollenbindung, Einheiten und nichtnegative Werte.

Die Session liefert die Benutzer-ID; Rolle, Aktivstatus und Mandant werden bei jeder Anfrage aktuell aus PostgreSQL gelesen. Kunden können keinen fremden Scope durch Queryparameter, Formulare oder JSON wählen. SUPER_ADMIN darf einen expliziten Scope verwenden. Die Oberfläche wählt initial den ersten vorhandenen Kunden; der interne API-Zugriff verlangt den Parameter tenantId ausdrücklich.

`src/server/policy.ts` definiert die Regeln. `data.ts`, `dashboard.ts` und `mutations.ts` wenden sie an. Detailabfragen verbinden ID und Scope in derselben Datenbankabfrage und antworten bei fremden IDs mit 404. Listen-APIs sind auf 200 Datensätze begrenzt. Nutzerfelder werden mit einer sicheren Projektion gelesen.

USER erhält Zugriff nur über PropertyGrant; die Freigabe gilt für Gebäude, Einheiten, Zähler, Messwerte, Alarme und Dashboard-Aggregationen der betreffenden Liegenschaft. Neue USER sehen ohne Freigabe keine fachlichen Daten.

**Grenze:** PostgreSQL Row Level Security ist noch nicht aktiviert. Fremdschlüssel verhindern falsche Verknüpfungen, ersetzen aber keine SELECT-Berechtigung. Die Lesetrennung wird derzeit von der getesteten Serviceschicht gewährleistet. Direkter Datenbankzugriff ist ausschließlich vertrauenswürdigen Serverprozessen erlaubt. Vor zusätzlichen Datenzugriffspfaden ist transaktionsgebundene RLS als zweite Schutzschicht zu prüfen; sie muss mit Connection-Pooling und bewusstem Plattformzugriff getestet werden.

## ADR 003: Authentifizierung und Rollen

Argon2id mit 19 MiB Speicher, zwei Iterationen und Parallelität 1. Das zufällige 256-Bit-Sitzungstoken liegt nur in einem HttpOnly-Cookie; die Datenbank enthält dessen SHA-256-Hash. Sitzungen laufen nach acht Stunden ab, Logout entfernt sie serverseitig. In Produktion ist Secure gesetzt, außerdem SameSite=Lax und Path=/.

Anmeldung verwendet generische Fehlermeldungen und prüft auch unbekannte Konten gegen einen Dummy-Hash. Fehlversuche werden atomar pro normalisierter E-Mail begrenzt (acht Versuche pro 15 Minuten, in PostgreSQL persistiert). Ein erfolgreicher Login erzeugt einen AuditEvent. Zusätzliche IP-/Edge-Limits und MFA gehören zum Produktionsausbau.

| Rolle        | Lesen                                                      | Schreiben                                            |
| ------------ | ---------------------------------------------------------- | ---------------------------------------------------- |
| SUPER_ADMIN  | Alle Kunden, bewusst gewählter Scope                       | Kunden und Mandantenobjekte                          |
| TENANT_ADMIN | Eigener Mandant                                            | Immobilien, Zähler, Benutzer, Freigaben, Alarmstatus |
| MANAGER      | Fachliche Daten im eigenen Mandanten, Dashboard-Auswertung | Keine Stammdatenänderungen                           |
| USER         | Freigegebene Liegenschaften und deren Nachfahren           | Keine                                                |

Neue Benutzer können per Tenant-UI niemals SUPER_ADMIN werden. Der Betreiberzugang wird initial durch den Demo-Seed angelegt. Passwort-Reset, Einladung, MFA, Rollenänderung und Benutzerdeaktivierung per UI folgen später.

Next.js Server Actions prüfen den Request-Ursprung. JSON-Schreibzugriffe prüfen Origin gegen APP_URL. Alle Mutationen prüfen Autorisierung erneut, validieren per Zod und schreiben AuditEvents atomar. Sicherheitsheader werden zentral gesetzt. Keine Anmeldung über öffentlich verteilte Demo-Schaltflächen.

## ADR 004: Messwerte und Auswertungen

Messwerte und Zählerstände werden als Decimal(20,6) gespeichert, Geld-Demo-Arbeitspreise als Decimal(10,4). Speicherung und Berichte verwenden explizit UTC. Verbrauch bedeutet Intervallverbrauch zum Zeitstempel; aktuelle Demo-Werte sind stündlich, historische Vorjahreswerte täglich. Die Anzeige ist ein Snapshot, kein Echtzeitstream.

Strom/Wärme in kWh, Wasser/Gas in m³. Keine Summierung über inkompatible Einheiten. Tages- und Monatswerte summieren nur gültige oder geschätzte Messwerte; INVALID wird ausgeschlossen. Der Vorjahresmonat ist ein vollständiger Monat und ausdrücklich so bezeichnet, kein identischer Zeitraumvergleich. Kosten entstehen je Zähler aus Monatsverbrauch × Demo-Arbeitspreis ohne Grundpreis, Steuer- oder Tariflogik. Gleitkommaformatierung in diesen Demo-Auswertungen ist nicht als Abrechnungslogik geeignet.

`(tenantId, meterId, timestamp, source)` ist eindeutig für idempotente Quellenimporte. Ein späterer Ingestion-Service muss zusätzlich Mehrfachlieferungen unterschiedlicher Quellen, Registerwechsel, Rücksetzungen, Messintervalle und Qualitätsprioritäten fachlich behandeln.

Demo-Alarme und Zählerstatus sind gespeicherte Beispieldaten. Es gibt noch keinen Scheduler, der reale Offline-Zustände oder Anomalien berechnet. Der Seed wird beim Start nicht automatisch ausgeführt.

## ADR 005: Integrationsgrenzen

Vorbereitet sind externe Geräte-ID, Hersteller/Modell, Source-Enum (DEMO, REST, MQTT, GATEWAY, MANUAL), Qualitätsstatus, Indexierung und fachliche Services. Es gibt bewusst keine offenen MQTT-/Webhook-/Geräte-Endpunkte und keine echten Zugangsdaten.

Nächste Ingestion-Architektur: Gerätecredential → Gateway/API → validierter Event → Queue → mandantengebundener Worker → Messwerte + Audit/Outbox. Geräteidentität bestimmt tenantId und meterId; eingehende Mandanten-IDs sind nicht vertrauenswürdig. Webhooks benötigen Signaturen, Replay-Schutz und Wiederholungslogik. Billing und Benachrichtigungen sind eigene zukünftige Module.

## ADR 006: Phase-2-Ingestion

`Device` ist ein digitales Kommunikationsendgerät für genau einen Mandanten und einen Meter. `Gateway` ist optional und kann mehrere Devices aufnehmen. `DeviceProtocol` enthält VIRTUAL und REST als aktive Implementierungen; MQTT, Modbus, M-Bus, Wireless M-Bus, LoRaWAN und Vendor API sind nur vorbereitete Enum-Werte.

Der REST-Transport ruft `ingestReading` auf. Die Schichten sind: Route/Transport → Bearer-Authentifizierung und Credential-Rate-Limit → Zod-Vertrag und fachliche Validierung → transaktionale Prisma-Persistenz → Dashboard-Aggregation. Der Simulator nutzt denselben HTTP-Transport und führt keine Reading-Inserts aus.

Credentials sind von Web-Sessions getrennt. Das Token wird zufällig erzeugt, nur gehasht gespeichert und bei Rotation werden Vorgänger widerrufen. Der letzte erfolgreiche Zugriff wird am Credential gespeichert. Falsche Einheit, negative Werte, rückwärts laufende Zählerstände, Zukunfts-Timestamps, deaktivierte Devices und fremde IDs werden abgewiesen. `messageId` ist je Tenant/Device idempotent. Payloads sind auf 16 KiB, Credentials auf 120 Requests/Minute begrenzt.

Reading erweitert die vorhandene Zeitreihe um `deviceId`, `messageId`, `meterValue` und `receivedAt`. Bestehende Demo-Readings bleiben gültig und werden durch `source=DEMO` im Dashboard sichtbar von REST-Ingestion unterschieden.

## ADR 007: Phase-3-Transport und Zustellgarantien

Der eigenständige `src/server/mqtt-worker.ts` abonniert versionierte Gateway-Topics. `gateway-ingestion.ts` authentifiziert jede Nachricht selbst mit einem aktiven, mandantengebundenen `GatewayCredential` und Ed25519-Signatur über Topic, Credential-ID und unveränderte JSON-Nutzdaten. Die neue Tabelle verwendet den zusammengesetzten Gateway-/Mandanten-Fremdschlüssel und eine versionierte SQL-Migration. Weder Benutzer-Cookies noch Mandantenangaben aus der Nachricht bestimmen die Geräteidentität.

Gateway- und Device-Zuordnung, Einheiten, Zeitpunkte und monotone Zählerstände werden vor der Speicherung geprüft. Gateway-/Device-Sperren serialisieren konkurrierende Nachrichten; Messwert und AuditEvent werden atomar geschrieben. Heartbeats werden ebenfalls auditiert. Device- und Gateway-Timeouts werden getrennt nach 15 Sekunden geprüft; Replay alter Werte beeinflusst die aktuelle Erreichbarkeit nicht. Die kurzen Intervalle sind lokale Demo-Einstellungen.

MQTT-QoS 1 allein bestätigt nur den Transport zum Broker. Deshalb entfernt die persistente Edge-Queue einen Eintrag erst nach einer zusätzlichen signierten Serverbestätigung nach Datenbank-Commit. Geht diese Bestätigung verloren, sendet der Agent dieselbe messageId erneut. Der Server bestätigt ein bereits gespeichertes Ereignis idempotent. Ein eigener Receipt-Schlüssel verhindert, dass ein beliebiger Teilnehmer des anonymen lokalen Brokers Queue-Einträge durch gefälschte Bestätigungen verwirft. Gateway-Credentials speichern öffentliche Schlüssel; private Gateway-/Receipt-Schlüssel liegen nur in `.local/`. Produktion benötigt einen Secret Store und einen getrennten Bereitstellungsprozess.

Der Simulator liefert echte Modbus-TCP-Frames auf Loopback-Port 1502. Registerwerte werden als BigInt in Mikro-kWh und als Dezimalzeichenfolgen übertragen; die Ingestion verwendet Prisma Decimal. Der Dashboard-Zugriff verwendet weiterhin die bestehenden Mandanten-/PropertyGrant-Filter, auch für den neuen Gateway-/Device-Status. Nur die automatische Aktualisierung ist eine Client-Komponente; die Daten bleiben serverseitig gefiltert.

Diese ADR ersetzt die früheren Aussagen über noch nicht angeschlossene MQTT-/Modbus-Transporte und fehlende Offline-Erkennung für die Phase-3-Gateway-Geräte. REST-Geräte ohne Gateway und historische Demo-Statuswerte fallen nicht unter diesen Offline-Worker. Produktionsgrenzen: anonymer lokaler Broker, kein TLS/ACL-Deployment, kein verteilter Worker-Betrieb, keine Queue-Kapazitäts-/Quarantäneverwaltung und keine produktive Credential-Administration.

## Betriebsreife und nächste Schritte

1. Benutzerlebenszyklus: Einladungen, Passwort-Reset, MFA, Sperrung und Freigabeentzug; wiederholbare Browser-E2E-Suite.
2. Deployment-Konzept: TLS, Secret Manager, getrennte Migrations-/App-DB-Rollen, optional FORCE RLS, Backup/PITR samt Wiederherstellungstest, Monitoring, Session-/Limit-Bereinigung, CSP mit Nonces.
3. Geräteauthentifizierung, Importvertrag, Queue, idempotente Ingestion und Lasttests.
4. Tages-/Monatsaggregate und Cursor-Pagination für große Datenmengen; aktuell lädt der 30-Tage-Chart gefilterte Rohwerte. Keinen unbegrenzten Großkundenbetrieb darauf aufbauen.
5. Tarife mit Gültigkeitszeiträumen, exakte Decimal-Abrechnung, Exporte, Alarmregeln und Benachrichtigungen.

## ADR 008: Hardwareprofile und gesteuerte Inbetriebnahme

Die Phase-3-Transportarchitektur bleibt erhalten. Zentrale, Zod-validierte JSON-Profile beschreiben Register und Dekodierung. Der Simulator ist ein eigenes verifiziertes Profil; das dreiphasige Hardwareprofil bleibt bis zur Handbuchprüfung unverifiziert. Der Edge-Agent liest TCP und RTU mit denselben Profilverträgen. Decimal/BigInt bewahren ganzzahlige Zählerpräzision; Byte-/Word-Order, Skalierung und Plausibilitätsgrenzen werden explizit geprüft.

Mandantengebundene ModbusConfiguration, ModbusDiagnostic, TelemetrySample, TechnicalMeasurement und GatewayCommand besitzen zusammengesetzte Hierarchie-Fremdschlüssel und eine versionierte Migration. Konfigurationen speichern revisionierte Profilsnapshots, damit verzögerte Queue-Daten weiterhin gegen ihren ursprünglichen Vertrag geprüft werden. Technische Messwerte verwenden Decimal; Importenergie speist zusätzlich die vorhandene Reading-Zeitreihe. Historische/ rückläufige Zählerstände erzeugen keinen künstlichen Verbrauch, sondern SUSPECT mit Nullverbrauch.

Web-Mutationen authentifizieren Sitzung, Rolle, Mandant und Zählerzugriff, validieren strikt und schreiben atomare AuditEvents. USER benötigt PropertyGrant auch für technische Daten und CSV. Administrative Rohdaten sind separat geschützt. Das UI zeigt nur begrenzte DTOs ohne Credentials. SUPER_ADMIN benötigt einen expliziten Mandanten.

Gateway-Kommandos werden über signierte Control-Pulls mit Request-ID und Gültigkeitsfrist zugestellt. Lokale Endpunktfreigaben verhindern beliebige Port-/Host-Zugriffe durch Serverkonfiguration. TEST/READ/START/STOP werden erst nach realer Gateway-Ausführung als erfolgreich markiert. Ergebnisse und autorisierte Konfiguration bleiben lokal erhalten. Polling läuft während Broker-Ausfällen weiter in die bestehende persistente Queue; signierte Commit-Bestätigungen und eindeutige Nachrichten-IDs verhindern doppelte Datenbankwerte. Abgelaufene Befehle werden nicht nach einem Neustart wiederholt.

Der Worker unterscheidet Gateway-Heartbeat und Gerätepoll. Einzelfehler führen zu WARNING, wiederholte Fehler zu OFFLINE; Verbindungsabbrüche sofort. Der Zeitablauf berücksichtigt Polling-Intervall/Timeout. Commissioning-Status und Verbindungsstatus sind getrennt: ACTIVE ist eine abgeschlossene Inbetriebnahme, ONLINE ein aktueller Kontakt. Erfolgreiche neue Werte beheben FAULT, alte Queue-Daten stellen keinen aktuellen Verbindungsstatus her.

Live-Daten werden alle fünf Sekunden über authentifizierte API-Zugriffe aktualisiert; inaktive Tabs pausieren. CSV begrenzt Zeitraum auf 31 Tage und Zeilen auf 10.000, verwendet UTC und Einheiten und entschärft Tabellenformeln. Keine Browser- oder Hardwareabnahme wird durch HTTP-/Simulatorprüfungen ersetzt. Betriebsgrenzen und Servicevorlagen stehen in `docs/EDGE-GATEWAY-OPERATIONS.md`.

## ADR 009: Pilotbetrieb ohne neue Dienstarchitektur

Phase 4b behält die signierte Phase-3-Kette und die Phase-4a-Profile unverändert bei. Pilot-MQTT nutzt gegenseitiges TLS, mindestens TLS 1.2, geprüften Servernamen und kontrollierte CA. Der Broker bindet ACLs an den zertifizierten CN, nicht an eine frei gewählte Client-ID. Gateway-CN entspricht der internen Gateway-ID; `meterwerk-ingestion` ist ausschließlich für den Worker reserviert. Die lokale anonyme Demo bleibt isoliert verfügbar. TLS-/Brokeridentität und Ed25519-Nachrichtensignatur sind getrennte Sicherheitsgrenzen.

Gateway-Credentials bleiben asymmetrisch: nur öffentlicher Schlüssel und SHA-256-Fingerprint in PostgreSQL, private Schlüssel ausschließlich in einmaligen, nicht cachebaren Erstellungs-/Rotationsantworten. Rotation/Widerruf sperren das alte Credential mit atomarem Audit. Ablauf und lastUsedAt werden bei Ingestion berücksichtigt. TLS-Clientzertifikate benötigen zusätzlich CA-/CRL-Verwaltung und Verbindungsabbruch bei Widerruf. Diese Verwaltungsmaßnahmen werden nicht durch eine zusätzliche Passwortdatenbank ersetzt.

Die bestehende Dateiqueue bleibt erhalten und lesbar für Phase-3-Werkzeuge. Ein Sidecar speichert Retry-Zeitpunkte, Altersmetadaten und begrenzte Quarantäne. Kapazität/Alter sind begrenzt, Backoff übersteht Neustarts. Zu große neue Einträge, abgelaufene Daten und ausgeschöpfte Sendeversuche werden quarantänisiert. Quarantäneverlust ist explizit gezählt und sichtbar; unbegrenzte Offline-Verlustfreiheit wird nicht behauptet. Der Agent öffnet MQTT erst nach Laden des lokalen Zustands und Registrierung seiner Listener, um ein verlorenes Connect-Ereignis zu verhindern.

WorkerHealth und TechnicalAlert sind mandantengebunden mit Tenant-Fremdschlüssel; Alarmobjekte sind serverseitig abgeleitete polymorphe Referenzen, keine clientseitig wählbaren Fremd-IDs. Der bestehende Worker beobachtet Verbindung und Geräte, während die authentifizierte Statusabfrage einen ausgefallenen Worker ebenfalls erkennt. Eindeutigkeit je Tenant/Typ/Objekt und eine Tenant-Sperre deduplizieren Übergänge; Erholung löst Alarme. MQTT-Unterbrechungsbeginn liegt in PostgreSQL, sodass mehrere Beobachter denselben Schwellenwert nutzen. Vollständiger Hostausfall erfordert einen externen Überwacher.

Strukturierte Logs verwenden eine Feldfreigabeliste und keine Payload-/Error-Serialisierung. Health-/Credential-Zugriffe authentifizieren jeden Einstieg und verlangen Administratorrechte. Backup bleibt ein explizites lokales Werkzeug: Custom-Archiv, Prüfsumme, Lesbarkeitsprüfung und transaktionaler Restore ausschließlich in eine neue Datenbank. Es gibt keine automatische Löschung oder Überschreibung der aktiven Datenbank.

Diese ADR ersetzt die früheren Hinweise auf fehlende TLS-/ACL-, Credential-, Queue- und Monitoring-Funktionen. Die standortspezifische Bereitstellung und reale Hardware-/Dauerbetriebsabnahme bleiben erforderlich; siehe `docs/PILOT-INSTALLATION.md`.

## ADR 010: Gemeinsame Utility-Profile und historische Tarife

Phase 5A verwendet den bestehenden MeterType für ELECTRICITY, WATER, GAS und HEAT. Ein zentraler Profilkatalog trennt Medium, Messgröße und Einheit; `Measurement` erweitert `Reading` um Decimal-Rohwerte, normalisierte Werte und Qualität. REST, bisherige Gateway-Readings und Modbus-Telemetrie schreiben in dieselbe Struktur. Der alte Reading-Vertrag sowie die Phase-3-/4a-/4b-Transporte bleiben kompatibel. Der Primärzählerstand liefert Verbrauch; technische Momentanwerte werden nicht addiert. Bestehende Readings werden per versionierter Migration mit ihrer bekannten Primärmessgröße ergänzt.

Neue Web-Einstiege authentifizieren selbst und verwenden aktuelle Sitzung, tenantScope und PropertyGrant. Gerätepakete bestimmen keine Mandanten-/Zähler-ID. Deduplizierung, Tenant-Sperre, Messwerte und AuditEvent liegen in einer Transaktion. Utility-Alarme teilen TechnicalAlert und dessen eindeutigen Tenant/Typ/Objekt-Schlüssel; der technische Monitor darf fachliche Alarme nicht pauschal auflösen.

Tariff ist mandantengebunden mit optionalem zusammengesetztem Zähler-Fremdschlüssel. Preise und Gasfaktoren gelten für historische Zeitintervalle; zukünftige Wechsel schließen offene Vorgänger atomar. Kosten verwenden Decimal, Tarifeinheiten bleiben mediengebunden und Tariflücken werden sichtbar. UTC-Berichte verwenden explizite Zeiträume und qualitätsgefilterte Werte. CSV bleibt begrenzt und freigabegefiltert. Der eigene Demo-Mandant vermeidet Änderungen an bestehenden Demo-Freigaben und Passwörtern. Details, Messgrößen und betriebliche Grenzen stehen in [MULTI-UTILITY.md](MULTI-UTILITY.md).

## ADR 012: SaaS-Pläne und serverseitige Entitlements

Phase 5f ergänzt `Plan`, `PlanFeature`, `Subscription`, `TenantFeatureOverride` und `TenantPlanOverride`. Eine Subscription ist tenantgebunden; die aktive Subscription wird nach Status und Gültigkeitszeitraum aufgelöst. BASIC, PROFESSIONAL und ENTERPRISE werden versioniert über eine Migration angelegt; bestehende Mandanten erhalten BASIC. Enterprise-Overrides können einzelne Features und Quoten für genau einen Mandanten ersetzen.

Entitlements werden ausschließlich in `src/server/licensing.ts` aufgelöst. `requireFeature` und `requireQuota` sind verbindliche serverseitige Prüfungen; eine ausgeblendete UI-Aktion ist keine Berechtigung. Reporting, Analytics, erweiterte Exporte und Device-API-Einstiegspunkte prüfen die jeweiligen Features. Quoten werden vor Stammdatenanlage geprüft. SUPER_ADMIN ist die einzige Rolle für Planwechsel und Overrides; jede Änderung schreibt ein AuditEvent. Es gibt keine Abrechnung, keine Zahlungsprovider und keine reale Hardwarekopplung.

## Usage und Limits (Phase 5f, Teil 2)

Die sieben Bestandszähler werden direkt aus mandantengefilterten Tabellen gelesen. Gebäude, Nutzungseinheiten und Devices erhalten zusätzliche Planfelder und Enterprise-Overrides. Ihre Standardlimits bleiben bis zur kommerziellen Festlegung unbegrenzt; bestehende Limits aus Teil 1 bleiben unverändert. Auch deaktivierte Ressourcen zählen zum Bestand. Null erlaubt keine Neuanlage.

Ressourcenanlage und Limitprüfung erfolgen in derselben Transaktion unter einer Tenant-Zeilensperre, einschließlich Einladungsannahme und Modbus-Device-Konfiguration. Planwechsel und Overrides verwenden dieselbe Sperre. Fehler rollen Anlage und Audit zurück. Downgrades löschen keine Daten; Bestandszugriffe und Bearbeitung prüfen kein Erstellungslimit. Enterprise-Overrides bleiben gespeichert, wirken aber ausschließlich bei aktivem Enterprise-Plan. Limitänderungen erzeugen atomar `subscription.limits_changed` neben den vorhandenen Plan- und Feature-Audits.

Die Admin-Anzeige verwendet wirksame Limits und zeigt Warnungen ab 80, 90 und 100 Prozent. Usage-Aggregate sind ausschließlich für SUPER_ADMIN mit explizitem Tenant und für TENANT_ADMIN des eigenen Tenants zugänglich. Snapshots lesen konsistent mit Repeatable Read.

`TenantUsageCounter` zählt monatlich in UTC authentifizierte Device-API-Aufrufe und serverseitig erzeugte Exporte ab Einführung der Erfassung. Authentifizierte Aufrufe zählen auch bei späterem fachlichem Fehler; anonyme/abgelehnte Authentifizierungen und interne Portalaufrufe zählen nicht. Reports werden als aktueller Bestand gezählt. Diese drei Werte sind Beobachtungswerte ohne zusätzliche Quoten oder Abrechnung; frühere Exporte/API-Aufrufe werden nicht rekonstruiert. Die Rückgabe eines Exports belegt keinen vollständigen Download beim Empfänger.

## ADR 013: Providerneutrale SaaS-Billing-Vorbereitung

Phase 5f Teil 3 ergänzt Testphase, Abonnementstatus, Laufzeit und Monats-/Jahresintervall, optionale Dezimal-Preisfelder, Rechnungskontakt und externe Billing-ID. `src/server/billing/provider.ts` hält einen neutralen Adaptervertrag für eine spätere Integration bereit. Kein Provider ist ausgewählt oder implementiert; es gibt keine Rechnungsstellung oder Zahlung. Vertragsfelder sind von `Tariff` und Energiekosten getrennt. Details, Statusübergänge, Rollen und Prüfungen: [SaaS-Pläne](SAAS-PLANS.md).

## ADR 014: Mandantengebundene öffentliche API

Phase 5g stellt lesende Routen unter `/api/public/v1/` bereit. Bearer-Secrets werden einmalig angezeigt und ausschließlich als SHA-256-Hash gespeichert; die Schlüssel tragen Tenant und Scopes. Serverabfragen erzwingen Tenant-Isolation, Scopes und ein transaktional begrenztes Rate-Limit. Verträge und Beispiele: [Public API](PUBLIC-API.md).

## ADR 015: Signierte tenantgebundene Webhooks

Webhook-Ereignisse werden in derselben Transaktion wie Messwert-, Alarm-, Report- und Verbindungsstatusänderungen in einer tenantgebundenen Outbox gespeichert. Ein separater Worker claimt Aufträge atomar, signiert unveränderliche Payloads per HMAC-SHA256 und liefert mit Retry/Dead-letter. Secrets liegen AES-GCM-verschlüsselt; Replay-Schutz besteht aus Zeitfenster, signierter stabiler Delivery-ID und Empfänger-Idempotenz. Details: [Tenant Webhooks](WEBHOOKS.md).

## Referenzen

- [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication)
- [Prisma 7 Upgrade Guide](https://docs.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- Zusätzlich wurden die installierten Prisma-/Next.js-Pakete und ihre lokalen Anleitungen geprüft.

## ADR 011: Protokollunabhängige Geräteprofile

Phase 5B führt eine gemeinsame Driver- und Ingestion-Grenze für MODBUS_RTU, MODBUS_TCP, MBUS, WMBUS, PULSE, LORAWAN, REST, MQTT und VENDOR_API ein. Adapter liefern normalisierte Messgrößen; Authentifizierung, Tenant-Prüfung, Validierung, Idempotenz, Persistenz, Aggregation und Alarme bleiben im zentralen Ingestion-Service. Die Adapter und virtuellen Geräte schreiben niemals direkt in PostgreSQL.

`DeviceProfile` versioniert Hersteller, Modell, Medium, Protokoll, Messgrößen, Einheiten und Decoder-Konfiguration. Historische Messwerte behalten dadurch ihre ursprüngliche Profilversion. M-Bus/Wireless-M-Bus, Pulse und LoRaWAN sind als Decoder und Simulatoren vorbereitet; konkrete Herstellerhardware, Schlüssel und produktive Funk-/Busanbindungen bleiben offen. Wireless-Schlüssel werden nur als Referenz auf einen Secret Store modelliert und nicht in DTOs oder Logs ausgegeben.

Ein `MeterReplacement` trennt den logischen Messpunkt von physischen Zählergenerationen. Ausbau-/Einbauzeitpunkte und Registerstände ermöglichen durchgehende Verbrauchs- und Tarifauswertungen ohne Änderung historischer Daten. Tarifintervalle werden zeitanteilig anhand von `validFrom`/`validTo` berechnet.
