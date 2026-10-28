# Architektur und Anforderungen

## RC7-Migrationslinie

Release Candidate `1.0.0-rc.7` baut auf dem tatsächlichen RC5/Staging-Commit `305580eb2f214bd867030545f0180bc8dbcb224f` auf. Die 49 historischen Migrationen einschließlich Gateway-Provisioning und Modbus-Commissioning-Evidence bleiben unverändert; `202610260001_saas_pricing` wird ausschließlich additiv ergänzt. Der divergierende RC6-Commit ist keine Upgrade-Basis. `scripts/acceptance-rc7-lineage.mjs` rekonstruiert RC5 aus Git-Blobs in einer leeren lokalen Testdatenbank, prüft vor und nach dem Upgrade Schema-Drift, historische Prüfsummen und unveränderte Gateway-/Modbus-Strukturen. Details: [RC7-Nachweis](RELEASE-RC7.md).

## Ziel und Umfang des Grundsystems

Meterwerk ist eine zentral betriebene B2B-Smart-Metering-Plattform. Ein Betreiber verwaltet Kunden; Kunden verwalten ihre eigenen Immobilien, Benutzer und Zähler. Die erste Ausbaustufe stellt ein funktionierendes, datenbankgestütztes Grundsystem mit Demo-Daten bereit. Sie ist noch keine freigegebene Produktionsinstallation.

Erfasste Anforderungen: Plattform → Mandant → Liegenschaft → Gebäude → Nutzungseinheit → Zähler → Messwerte; Strom, Wasser, Gas, Wärme; vier Rollen; gesicherte Serverzugriffe; Dashboard; neun Verwaltungsbereiche; spätere Integrationen.

## ADR 001: Modularer Monolith

Next.js 16 App Router mit React 19 und TypeScript strict. Server Components lesen über eine gemeinsame Serviceschicht. Server Actions bedienen Formulare, Route Handlers die interne REST-Schnittstelle. PostgreSQL 17 und Prisma 7 einschließlich pg-Adapter speichern alle fachlichen Daten. Tailwind CSS 4 und lokale shadcn/ui-Bausteine bilden die Oberfläche.

Der Monolith reduziert Betriebsaufwand und verhindert doppelte Berechtigungslogik. MQTT-Verarbeitung, große Importe und Benachrichtigungen sollen später als Worker ergänzt werden, ohne dass das Frontend oder Domänenmodell in Microservices zerlegt werden muss.

Die installierten Versionen sind im pnpm-Lockfile fixiert. Produktiv immer `pnpm install --frozen-lockfile` verwenden.

## ADR 002: Mandantentrennung

Shared Database / Shared Schema. Alle fachlichen Tabellen besitzen tenantId. Zusammengesetzte Unique-Keys `(id, tenantId)` und Fremdschlüssel verhindern, dass etwa ein Gebäude auf eine Liegenschaft eines anderen Mandanten verweist. Zusätzliche SQL-Constraints sichern Rollenbindung, Einheiten und nichtnegative Werte.

Die Session liefert die Benutzer-ID; Rolle, Aktivstatus und Mandant werden bei jeder Anfrage aktuell aus PostgreSQL gelesen. Kunden können keinen fremden Scope durch Queryparameter, Formulare oder JSON wählen. SUPER_ADMIN darf einen expliziten Scope verwenden. Die Oberfläche verlangt eine explizite Kundenauswahl und leitet ohne Auswahl zur Kundenübersicht; der interne API-Zugriff verlangt den Parameter tenantId ausdrücklich.

`src/server/policy.ts` definiert die Regeln. `data.ts`, `dashboard.ts` und `mutations.ts` wenden sie an. Detailabfragen verbinden ID und Scope in derselben Datenbankabfrage und antworten bei fremden IDs mit 404. Listen-APIs sind grundsätzlich auf 200 Datensätze begrenzt. Die verwaltungsberechtigte Benutzerliste lädt alle Benutzer genau eines Mandanten; DataTable paginiert diese im Browser. Nutzerfelder werden mit einer sicheren Projektion gelesen.

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

Gateway-Credentials speichern nur den öffentlichen Ed25519-Schlüssel und den
SHA-256-Fingerprint. Private Keys werden lokal auf dem Gateway erzeugt; produktive
HTTP-APIs erzeugen oder liefern keine privaten Schlüssel. Die lokale
Demo-Einrichtung `seed-edge.ts` bleibt auf SEED_DEMO=true, Nicht-Produktion und
eine Loopback-Datenbank beschränkt. Ablauf, Widerruf und lastUsedAt werden bei
Ingestion berücksichtigt. TLS-Clientzertifikate benötigen zusätzlich CA-/CRL-
Verwaltung und Verbindungsabbruch bei Widerruf.
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

CSV-Datenimporte verwenden eine kurzlebige mandantengebundene DataImport-Vorschau. Der Commit bindet Batch, User und Tenant, prüft Lizenzlimits unter Tenant-Sperre erneut und schreibt alle Ressourcen plus AuditEvent atomar. Zeitstempel benötigen einen expliziten Offset; Dezimalwerte werden verlustfrei als Decimal-Strings übernommen. Details und Feldverträge stehen in [DATA-IMPORT.md](DATA-IMPORT.md).

# Datenqualität und CSV-Import

Phase 5h Teil 3 verwendet Keyset-Paginierung für die Import-Historie (25), Befunde (50) und Streaming-Export (1.000 Messwerte pro Datenbankblock). Exportabfragen prüfen Tenant und PropertyGrant auf jeder Seite. Ein `receivedAt`-Stichtag begrenzt spätere Zugänge, ersetzt aber keinen transaktionalen Snapshot bei parallelen Korrekturen. Downloads nutzen einen nativen Browser-Download und keinen vollständigen Client-Blob.

Phase 5i Teil 1 speichert Regeln und Ausführungen tenantgebunden mit zusammengesetzten Fremdschlüsseln. Bedingungen werden als Zod-validierte Datenstrukturen ausgewertet; ein Code-Interpreter ist absichtlich nicht vorhanden. Ein idempotenter Event-Key verhindert doppelte Aktionen bei Wiederholungen. Details: [Rules Engine](RULES-ENGINE.md).

Sammelstatusänderungen, Befundbestätigungen und das Überspringen fehlerhafter Importzeilen prüfen die gesamte ID-Auswahl vor einer atomaren Mutation unter Tenant-Sperre. Der AuditEvent erhält strukturierte Details für IDs, Grund und Zielstatus. Bestätigung eines Befunds und Behebung des Problems bleiben getrennte Zustände. DataImport speichert Datei-/Benutzersnapshot und Ergebniszähler dauerhaft; abgeschlossene Vorschauwerte werden gelöscht, die Historie bleibt erhalten. Veraltete Vorschauen werden als abgelaufen angezeigt statt beim nächsten Upload gelöscht. Die Migration erweitert bestehende Tabellen und führt keine mandantenlose Fachdatentabelle ein.

CSV-Import und Datenqualitätsprüfung sind tenantgebundene Serverfunktionen in `src/server/`. Datenqualitätskorrekturen speichern immutable Before-/After-Snapshots, verpflichtende Begründung und AuditEvent innerhalb derselben Transaktion; ungültige Messwerte bleiben lesbar erhalten. Details und Erkennungsschwellen: [DATA-QUALITY.md](DATA-QUALITY.md) und [DATA-IMPORT.md](DATA-IMPORT.md).

## Field Service (Phase 5m, Teil 1)

Die bestehende Server-/Sessionarchitektur bleibt unverändert. `src/server/field-service.ts` authentifiziert jeden öffentlichen Datenzugriff selbst und kombiniert Tenant-, PropertyGrant- und persönliche Assignment-Prüfungen. Techniker sind aktive USER mit Grant und Zuweisung; MANAGER/TENANT_ADMIN verwalten innerhalb des bisherigen Tenant-Bereichs. SUPER_ADMIN benötigt eine explizite Tenant-Auswahl und erhält hier nur Diagnose-/Lesezugriff.

Die Migration `202609240012_field_service` ergänzt WorkOrder, TechnicianAssignment, WorkOrderChecklist, ChecklistItem und WorkOrderComment sowie feste Typ-, Prioritäts- und Status-Enums. Jeder Datensatz trägt tenantId, zusammengesetzte Fremdschlüssel sichern die Zugehörigkeit. Die Servervalidierung prüft zusätzlich Liegenschaft/Gebäude/Einheit/Zähler. WorkOrderStatus ist ein Enum; historische Übergänge werden im bestehenden AuditEvent dokumentiert.

Alle Auftragsmutationen einschließlich Kindobjekten sperren die WorkOrder-Zeile und schreiben Audit und Nutzdaten atomar. Abschluss und Pflichtpunktänderungen sind dadurch serialisiert. Entwürfe werden nur logisch gelöscht, terminale Aufträge bleiben unveränderlich. Kein Offline-Schreibcache, kein Gerätekommando, keine Nachrichten und kein tatsächlicher fachlicher Zählerwechsel. Die mobile RSC-Ansicht nutzt die vorhandene PWA-Shell und kleine Client-Formulare. Zeitangaben und Tagesfilter verwenden UTC. Verträge und Grenzen: [Field Service](FIELD-SERVICE.md).

## Field Service (Phase 5m, Teil 2)

Die WorkOrder-Sperre bleibt der gemeinsame Serialisierungspunkt für Dokumentation, Kinddaten, Upload-Metadaten und Abschluss. Strukturierte Dokumentation und Inbetriebnahme liegen als strikt Zod-validierte JSONB-Snapshots am Auftrag; WorkOrderEntry enthält diskriminierte Material-, Zeit- und Bestätigungsdaten. Materialmengen stehen zusätzlich als Decimal(20,6) in PostgreSQL. Zeitpunkte sind offsetpflichtig, Anzeige/Berichtszone UTC; Dauer und Nettominuten werden aus Intervallen abgeleitet. Alle neuen Kindtabellen tragen tenantId und zusammengesetzte Auftrags-Fremdschlüssel; Einträge referenzieren ihren Akteur mandantengebunden.

WorkOrderReceipt speichert Request-ID, Akteur, Digest und Ergebnisrevision atomar zur Mutation. Replay wird nach erneuter Authentifizierung und Bereichsprüfung auch nach Abschluss bestätigt; abweichende Nutzlasten/Revisionen liefern 409. Dies ist keine Offline-Datenbank: Eingaben, Dateien und ausstehende Requests bleiben ausschließlich im Tab-Arbeitsspeicher. Es gibt keine automatische Hintergrundübertragung. Wiederholung nutzt exakt dieselben Daten. Formulare zeigen ausstehende/ungespeicherte Änderungen; Versionskonflikte müssen abgeglichen werden.

Zählerwechsel verwenden den gemeinsamen internen replaceMeterInTransaction-Kern des bestehenden MeterReplacement-Workflows. Der WorkOrder-Einstieg autorisiert zusätzlich persönliche Zuweisung, PropertyGrant, Hierarchie und tenantgebundene Fotos. Vorhandene Protokolle können alternativ verknüpft werden; eine eindeutige zusammengesetzte Relation verhindert fremde Mandanten oder Mehrfachverwendung. Seriennummern, Medium, Einheit, Kontakt und Techniker werden als Einsatzsnapshot festgehalten.

ChecklistTemplate enthält Typ, Medium, optionales Geräteprofil, Version und Abschlussanforderungen. Übernahme kopiert die Itemdefinitionen in eine neue Einsatzcheckliste; spätere Vorlagenänderungen berühren keine bestehenden Aufträge. Der Abschluss prüft Pflichtpunkte, Arbeitsbericht, ausgeführte Arbeiten, plausible tatsächliche Zeiten, darin liegende Arbeitszeitblöcke, typabhängige Protokolle und konfigurierte Unterschriften.

Signaturen bestehen aus begrenzten numerischen Linienzügen, Name, Rolle, serverseitigem Zeitpunkt und Audit-Digest. Es handelt sich ausschließlich um Einsatz-/Abnahmebestätigungen. Nach der ersten Bestätigung werden fachliche Einsatzdaten und Anhänge gesperrt; weitere erforderliche Bestätigungen und Abschluss bleiben möglich. Keine stillen Überschreibungen oder Wiedereröffnung. Ein expliziter Nachtrags-/Stornoprozess ist später separat zu spezifizieren.

Attachment wird mit tenantgebundener WorkOrder-Relation, Kategorie, Beschreibung, Request-ID und Inhaltshash erweitert. Bestehende autorisierte Download-Route bleibt verpflichtend: private/no-store, nosniff, Content-Disposition attachment. Uploads prüfen begrenzten Multipart-Body, Dateigröße, MIME, Endung und Dateisignatur; zulässig sind JPEG, PNG, PDF und UTF-8-TXT. SVG, ausführbare Dateien und Office-Dokumente sind nicht zugelassen. Dies ersetzt keine Malwareprüfung. Lokaler Storage und S3-kompatible Storage-Abstraktion sind vorhanden; konkrete Provider-/Versionierungs-/Restore-Validierung bleibt offen und wird in [Known Limitations](KNOWN-LIMITATIONS.md) geführt.

# Gesamtübersicht

Meterwerk ist eine Next.js-App mit serverseitigen Datenzugriffen unter `src/server/`, PostgreSQL/Prisma als Quelle, MQTT und optionalem Edge Gateway. Tatsächliche eigenständige Prozesse sind MQTT-Ingestion/Webhook-Outbox, Rules Worker und Rollout Worker. Ein separates Notification-, Report- oder Backup-Worker-Programm ist derzeit nicht vorhanden. Mail-Providerzustellung und konkrete S3-Providervalidierung sind offene Punkte. Aktuelle Einzelheiten stehen in [Worker-Betrieb](WORKERS.md), [Monitoring](MONITORING.md) und [Known Limitations](KNOWN-LIMITATIONS.md).

## Datenfluss

`Zähler → Gateway/Simulator → Protokolltreiber → MQTT oder REST → Ingestion → PostgreSQL → Analytics/Rules → Portal/Dashboard/Reports`. Edge-Komponenten können Nachrichten bei Broker-/Netzausfall zwischenspeichern und nach Wiederverbindung mit Message-ID/Idempotenz weiterleiten. Webhooks und Mail laufen über serverseitige Outbox-/Retry-Pfade.

## Fachliches Modell

`Platform → Tenant → Property → Building → Unit → Meter`. Devices und Gateways liefern Messwerte für Meter; DeviceProfiles beschreiben Protokoll-/Capabilities. Readings sind zeitbezogene Messwerte, Alarms und AnalyticsAnomalies markieren Auffälligkeiten. Rules erzeugen Auswertungen/Aktionen, WorkOrders bilden Einsätze, SupportCases Supportarbeit, Dashboards und Reports Präsentation/Export. Public API Keys, Webhooks, BackupRecord/RestoreTestRun und DR-Drills sind tenant- bzw. operationsgebundene Konfigurationen.

## Rollen und Grenzen

SUPER_ADMIN arbeitet nur mit expliziter Tenant-Auswahl. Implementierte Rollen sind `SUPER_ADMIN`, `TENANT_ADMIN`, `MANAGER` und `USER`; `TECHNICIAN` ist keine eigene globale Rollen-Enum. Technikerarbeit beruht in unterstützten Field-Service-Pfaden auf USER, Grant und Assignment. Siehe [Rollenpolitik](admin/SUPER-ADMIN-GUIDE.md) und [Technikerhandbuch](technician/TECHNICIAN-GUIDE.md).

## Betriebskomponenten

PostgreSQL speichert Fach- und Auditdaten, Prisma versioniert Migrationen, MQTT verbindet Ingestion/Gateway. Worker- und Queue-Umfang ist in [WORKERS.md](WORKERS.md) beschrieben. Operations und DR-Metadaten sind vorhanden, aber nicht jeder Status ist an produktive Provider oder externe Alerting-Systeme angebunden. Siehe [Monitoring](MONITORING.md), [Security](SECURITY.md) und [Disaster Recovery](DISASTER-RECOVERY.md).

## Acceptance-Korrekturen aus Phase 5v Teil 2

SupportCases referenzieren Property, Meter, Device und Gateway über zusammengesetzte Fremdschlüssel einschließlich `tenantId`. Attachment-Uploader dürfen demselben Mandanten oder bewusst der globalen SUPER_ADMIN-Ebene angehören; ein Datenbanktrigger prüft diese Regel beim Schreiben eines Attachments. Migrationen lehnen vorhandene inkonsistente Referenzen ab, statt Datensätze zu löschen oder automatisch umzuhängen.

Bei verschachtelten Prisma-ChecklistItem-Erstellungen werden `checklistId` und `tenantId` von der zusammengesetzten Parent-Relation übernommen. Die redundante explizite Angabe von `tenantId` wurde entfernt, weil Prisma sie zur Laufzeit ablehnt. Die tatsächlich gespeicherten Mandanten sowie Fremd-ID-/Grant-Sperren werden mit PostgreSQL geprüft.

Die Acceptance-Infrastruktur ist lokal getrennt. DB-Serviceprüfungen mit injiziertem Actor, echtes HTTP, Browserkomponenten mit Testantworten und vollständige E2E-Journeys werden im Bericht getrennt ausgewiesen. Siehe [Software Acceptance](SOFTWARE-ACCEPTANCE.md).

## Fortsetzung Phase 5v auf e88b1de

DemoScenarioState ist über `(environment, tenantId)` eindeutig. SUPER_ADMIN wählt
einen der zwei synthetischen Demo-Mandanten ausdrücklich; DEMO/TEST wird serverseitig
erzwungen. Apply sperrt den Tenant und schreibt Fixturezustand, Szenarioauswahl und
Audit atomar. Ein stabiler UTC-Anker macht Verbrauchsprofile reproduzierbar;
Refresh ist erneutes Anwenden, kein fortlaufender Simulator. Der explizite lokale
Command-Adapter verarbeitet nur STATUS_REQUEST für das VIRTUAL-Szenariogerät,
ohne Socket oder Hardwarezustellung. Analytics, Forecast und Insights wenden
PropertyGrant-Sichtbarkeit auch auf Aggregationen an.

Migration 47 ergänzt die Tenantbindung. Der lesende Migrationspreflight akzeptiert
nur bekannte Checksummen einschließlich äquivalenter Zeilenenden. Historische
Migrationen werden in dieser Fortsetzung nicht erneut editiert; externe
Supportgrenzen bleiben nach [Migrationsbaseline](MIGRATION-BASELINE.md) offen.

Release-SBOM und Verpackung verwenden denselben Versionswert. Lokale Pakete tragen
Git-SHA, Dirty-Status, Plattform, Build-ID und SHA-256-Prüfsummen. Das ist keine
signierte Provenance; Images, portabler Runtimebetrieb und Staging sind separate Gates.

## Release-Runtime-Fortsetzung ab 943d23f

Worker starten die vorhandenen JavaScript-Bundles mit Node und ausschließlich
Produktionsabhängigkeiten. Web verwendet einen expliziten Node-Entrypoint und
den CLI-Kopierhelfer für das native Argon2-Binding. Image-Smokes verlangen für
Worker passende Shutdown-Meldungen und Exitcode 0. Der Release-Build installiert
Build-Abhängigkeiten ausdrücklich unabhängig von NODE_ENV. Lokale Regression
ersetzt keinen Linux-Containerlauf; siehe [Checkpoint-Nachweis](acceptance/PHASE-5V-CHECKPOINT-943D23F.md).

## Worker-Deployment ab 5eae186

Ein vollständiger eingefrorener pnpm-Install bleibt ausschließlich im Build.
`deploy-worker-runtime.mjs` verfolgt die externen Imports der drei vorhandenen
JavaScript-Bundles mit dem bereits im Lockfile gebundenen Next-File-Tracer.
Nur dessen Laufzeitdateien, Paketmetadaten und Lizenzhinweise gelangen über
ein frisches Deployment-Verzeichnis in die letzte Docker-Stufe. Eine positive
Dateiliste mit SHA-256 und Symlinkzielen dokumentiert den Umfang. Kein zusätzlicher
Package-Install und kein pauschales Löschen von Dependency-Fixtures im Runtimebaum.

`pnpm install --prod` allein genügte hier nicht: aufgelöste optionale Peer-Kanten
zogen Prisma CLI/TypeScript über Prisma Client und Playwright über Next hinein.
Diese Pakete sind bereits korrekt als direkte Dev-Dependencies klassifiziert;
package.json, Lockfile und Workspace-Datei bleiben unverändert. Benötigt bleiben
Prisma Client/PG-Adapter, PostgreSQL-Treiber, MQTT, Zod, Decimal, Argon2 samt
Linux-musl-Binding und tatsächlich referenzierte Next-/React-Serverdateien.
tsx, TypeScript, Prisma CLI, Playwright, Projekt-Tests und Paketmanager sind im
geprüften Runtime-Dateisystem nicht vorhanden.

Das CI-Image-Gate prüft die physische Dateiliste, Hashes, externen Imports und
native Argon2-Funktion vor den drei Runtime-/SIGTERM-Smokes. Dependency-Fixtures
werden inventarisiert, nicht pauschal verboten. Die Image-SBOM-Prüfung löst auch
geschachtelte Dateireferenzen auf und bindet die SBOM an die Runtime-Image-ID.
Aktuelle lokale Nachweise und verbleibende Release-Gates stehen im
[Worker-Image-Nachlauf](acceptance/WORKER-IMAGE-5EAE186.md).

## Externes Staging: getrennte Runtime und Migrationen

Das externe Staging-Overlay ergänzt ausschließlich Infrastrukturkonfiguration:
ein internes Netz für Web, drei Worker, PostgreSQL und MQTT; einziger Host-Port
ist Loopback:3000 hinter dem bereits vorhandenen Host-Apache auf Ubuntu 24.04.
Ein eigener namensbasierter Staging-VHost ist nur als Vorlage vorbereitet;
vorhandene VHosts und Hostdienste bleiben unverändert. MQTT verwendet eigene CA/CRL,
Zertifikat-CNs und ACLs, externe read-only-Dateimounts und eine getrennte
Health-Identität ohne fachliche Topic-Rechte. Es gibt keinen Egress für echte
Nachrichten oder Providerzugriffe. Runtime-Guards werden nicht verändert.

`Dockerfile.migrations` enthält bewusst vollständige eingefrorene Dependencies
einschließlich Prisma-CLI und dem vorhandenen Baseline-Check. Es wird aus derselben
Revision wie Web/Worker gebaut, per Digest ausgewählt und nur manuell über das
Compose-Profil `operations` verwendet. Normaler Containerstart verändert kein
Schema; Paketmanager/Prisma-CLI bleiben aus dem Worker-Runtime-Image ausgeschlossen.
Der Preflight bindet alle drei Image-Arten an denselben SHA und dieselbe Version.

Das öffentliche Staging-Label wird im Web-Docker-Build gesetzt und als OCI-Label
nachweisbar gemacht. Ein für Staging gebautes Web-Image wird nicht als generisches
Production-Image behandelt: NEXT_PUBLIC-Werte bleiben im Browser-Bundle fixiert.
Runbook und offene externe Abnahmen: [STAGING.md](STAGING.md).

### Einmaliger Staging-Administrator

`pnpm staging:create-admin` ist ein expliziter Operations-Einstieg ohne Benutzersitzung, ausschließlich für den ersten Benutzer im geprüften internen Staging-Ziel. CLI-Umgebungs- und Eingabeprüfung erfolgen vor dem Verbindungsaufbau; fachliche Mutation und bestehendes Argon2id-Hashing liegen in `src/server/`. Der Bootstrap berechtigt weder HTTP-Aufrufe noch bestehende Benutzer zur Rolleneskalation. `src/server/staging-database.mjs` teilt die exakte Datenbankzielprüfung mit dem Compose-Preflight.

Eine PostgreSQL-Tabellensperre (`LOCK TABLE "User" IN EXCLUSIVE MODE`) schützt unter explizitem READ COMMITTED die globale Leerprüfung und den Insert auch vor konkurrierenden normalen Schreibzugriffen. Nach wartender Sperrübernahme sieht die nächste Abfrage den aktuellen Commitstand. User und AuditEvent werden atomar geschrieben; die Sperre wird bei Commit/Rollback freigegeben. Es gibt keine Schemaänderung, keinen Seed und keine Änderung am Login-/MFA-Verhalten. Operationsimage und manueller Ablauf: [STAGING.md](STAGING.md#einmaliger-erster-plattformadministrator).

## SaaS-Preisberechnung

`src/server/billing/pricing.ts` berechnet Preise ausschließlich mit Decimal (40 Stellen Präzision) und liefert Geldwerte als Dezimalstrings. `tenantBilling` und `tenantSubscription` verwenden dieselbe Berechnung und lesen Subscription und abrechenbare Meter in einer RepeatableRead-Transaktion. Der Count filtert ausschließlich auf den autorisierten `tenantId` und `billable=true`, unabhängig vom technischen Status. Die Kundenabfrage bleibt auf TENANT_ADMIN/SUPER_ADMIN beschränkt; SUPER_ADMIN muss einen Mandanten auswählen. Interne Provider-IDs werden nicht in die Kundenprojektion aufgenommen.

`FIXED` verwendet unverändert `priceAmount`, auch `null` bei nicht vereinbarten Preisen. `BASE_PLUS_METER` verwendet Grundpreis plus Count mal Messpunktpreis; die Preise gelten direkt für `billingInterval`. Es gibt keine Intervallumrechnung, zeitanteilige Abrechnung oder Verbindung zu Energietarifen. Zod begrenzt Eingabepreise auf nichtnegative Decimal(12,2)-Werte. Nur SUPER_ADMIN ändert Metadaten, mit Tenant-Lock und atomarem AuditEvent. Fehlendes `pricingMode` erhält bei älteren Clients das aktuelle Modell; für automatische Preise sind beide Teilbeträge erforderlich. Clientseitige Gesamtsummen werden nicht übernommen.

Die additive Migration `202610260001_saas_pricing` setzt Bestandsverträge auf `FIXED` und Meter auf `billable=true`, mit Ausnahme aller tenantgesichert referenzierten Altzähler. Ein Zwischenzähler einer Wechselkette bleibt damit nicht abrechenbar. `replaceMeterInTransaction` setzt Alt-/Neuzähler-Abrechenbarkeit in derselben Transaktion wie Wechsel und Audit; technische Statusmutationen verändern sie nicht. Die gemeinsame UI-Komponente formatiert Backend-Strings ohne Float-Konvertierung und bietet keine Preisbearbeitung im Kundenbereich.

## Kundenbenutzerverwaltung

Die bestehenden Kundenübersichten verlinken auf /users?tenantId=… in der vorhandenen dynamischen Verwaltungsseite. CreateForm und EntryActions verwenden unverändert createAction → mutate → writeResource einschließlich hashPassword, Zod, tenantScope, Rollenprüfung, Tenant-Lock und atomarem AuditEvent. Es gibt keine zusätzliche Benutzeranlage und keine Schemaänderung. Sichere Selects schließen Passwort- und MFA-Geheimnisse aus; SUPER_ADMIN gehört nicht zu den erlaubten Kundenrollen. Erfolgreiche Mutationen revalidieren über die bestehende Server Action die Listen.

## Gateway-/Device-Sicherheit, Phase 1A

deviceCompliance und gatewayHealth verwenden propertyScope wie die bestehenden
Listen-/Detailpfade. USER benötigen eine Freigabe über Meter → Unit → Building →
Property; Gateway-Zugriff benötigt mindestens ein sichtbares Gerät. Geräte- und
Command-Aggregate sowie gerätebezogene Wartungsfenster sind auf diese Sichtbarkeit
begrenzt, ohne RBAC-Erweiterung.

Einzel- und Bulk-Lifecycle-Mutationen nutzen dieselbe Transition-Prüfung innerhalb
der Transaktion. Sperren folgen Gateway → Device; nach der Sperre wird der aktuelle
Lifecycle erneut gelesen. DECOMMISSIONED setzt zusätzlich den technischen Status
DISABLED, widerruft aktive DeviceCredentials, deaktiviert ModbusConfiguration und
storniert PENDING-Modbus-Commands atomar mit dem AuditEvent. Bereits widerrufene
Credentials behalten ihren Widerrufszeitpunkt. Device-Authentifizierung sowie
REST-, Utility-, Gateway- und Modbus-Ingestion berücksichtigen den terminalen
Zustand; Konfiguration kann ihn nicht wieder aktivieren. Offline-Edge-Caches
können erst beim nächsten Steuerkontakt deaktiviert werden.

Device-Token-Ausgabe/Rotation sperrt das Device gegen konkurrierende Ausgabe und
Decommissioning. Ausgabe, Rotation und Widerruf verwenden atomare AuditEvents mit
IDs und Zählern, niemals Token oder Hash. Die bestehende Fleet-Rotation bleibt
auditiert und lehnt ebenfalls DECOMMISSIONED ab.

START prüft die vorhandene ModbusConfiguration statt eines zusätzlichen
Statusmodells: ACTIVE, completedAt, reviewedRevision gleich revision,
confirmedUnitId gleich aktueller Meter.unitId und verifiziertes Profil.
ASSIGN_PROFILE ändert nur die mandantengeprüfte Profilzuordnung und benötigt
keinen Lifecycle-Status. Keine Schemaänderung oder Migration erforderlich.

## Gateway-Lifecycle und direkte Liegenschaft, Phase 1C-A

`GatewayLifecycle` ist von `Gateway.status` getrennt. NEW, PROVISIONING, ACTIVE,
MAINTENANCE, FAILED und DECOMMISSIONED bilden administrative Zustände ab;
Heartbeats und Offline-Erkennung ändern ausschließlich Kommunikationsdaten.
Der erste akzeptierte neue Heartbeat speichert `firstContactAt` als Serverzeit.
Alle neuen Meilensteine verwenden PostgreSQL TIMESTAMPTZ(3). Bestehende
Zeitspalten bleiben kompatibel; insbesondere wird `installedAt` nullable und
bei neuer Vorbereitung nicht gesetzt. Historische Werte gelten nicht als
Installationsnachweis. Es erfolgt keine Bestandsaktivierung oder Property-Inferenz.

`changeGatewayLifecycle` und `assignGatewayProperty` authentifizieren selbst,
verlangen SUPER_ADMIN sowie explizite Mandantenwahl, validieren strikt und
schreiben Änderungen mit Audit in derselben Transaktion. Administrative Änderungen
verwenden `revision` und Zeilensperren. Identische Zielzustände sind idempotent
ohne erneutes Audit; sonst führt eine veraltete Revision zu einem Konflikt.
Die erlaubten Übergänge stehen zentral in `gateway-lifecycle.ts`; alle Übergänge
nach ACTIVE bleiben bis zur nachweisgebundenen Readiness-Prüfung gesperrt.
Fehlergründe sind begrenzte Codes statt unbereinigter Providerantworten.

Der zusammengesetzte FK `(propertyId, tenantId)` sichert die Gateway-Property-
Tenantgrenze. Die zusätzliche Device-/Meter-Property-Invariante liegt in der
transaktionalen Serverprüfung `assertGatewayAssignment`. Der aufrufende Service
authentifiziert; der interne Helper ist kein externer Einstiegspunkt. Neue Links
benötigen eine direkte Property. Bei NULL ist nur derselbe bereits gespeicherte
Device-/Gateway-/Meter-Link zulässig. Erstanbindung eines Legacy-Gateways an eine
Property prüft alle Devices; mehrere Properties werden zurückgewiesen.
Propertywechsel verlangen NEW oder MAINTENANCE, keine zugeordneten Devices und
keine offenen Commands; Erstanbindung von NULL darf konsistente Devices behalten.
Tenantwechsel werden nicht angeboten. Propertyänderungen entwerten commissionedAt.

Zuordnungs- und Hierarchieschreibpfade serialisieren über Tenant, danach Gateway
und Device. Deviceanlage/-änderung und Modbus CONFIGURE nutzen denselben Helper.
CRUD-Hierarchieverschiebungen und Modbus ASSIGN werden bei Gateway-Nachfahren
konservativ blockiert. CSV-Bestätigung blockiert Gateway-Imports sowie Device-
Imports mit Gateway-ID vollständig. Reine Device-Verwaltung behält bestehendes
RBAC. Ein späterer Import-/Umzugsworkflow muss dieselben Sperren und Prüfungen
verwenden. Der mehrstufige Property-Abgleich ist kein genereller DB-Trigger:
direkte SQL-Schreibzugriffe gehören nicht zur unterstützten Administration.

Stilllegung widerruft alle aktiven GatewayCredentials, storniert PENDING, QUEUED,
SENT und ACKNOWLEDGED Commands als CANCELLED, setzt pollingEnabled=false und
markiert externe
Kommunikationsidentitäten mit revocationRequestedAt. Das Audit
benennt den erforderlichen externen Brokerwiderruf. Device-Lifecycle und technischer
Gatewaystatus werden nicht umgedeutet. Gateway-Ingestion prüft den terminalen
Lifecycle unter derselben Gateway-Sperre. DB-Trigger verweigern aktive neue
Credentials, offene Commands und neue Kommunikationsidentitäten für stillgelegte
Gateways, auch aus bisherigen Command-Produzenten. Offline-Edge-Polling kann bis
zum lokalen Eingriff weiterlaufen; keine Behauptung eines physischen Fernstopps.

`GatewayCommunicationIdentity` ist ausschließlich öffentliches Inventar mit
zusammengesetztem Gateway-/Tenant-FK. SHA-256-Fingerprints sind global eindeutig
und kanonisch kleingeschrieben; CN entspricht der internen Gateway-ID. DB-Checks
validieren Format, Gültigkeitsintervall und Widerrufszeitfolge. Der authentifizierte
Registrierungsservice akzeptiert nur definierte Referenzen und Metadaten, schreibt
Audit und meldet Brokerstatus UNVERIFIED. Er stellt weder Zertifikate aus noch
bestätigt er deren Echtheit oder schaltet einen Broker frei. Private Keys, CA-Keys,
Passphrases und geheime Brokerzugänge sind kein Bestandteil des Modells.

Die globale Suche verwendet für USER die direkte Gateway-Property samt
`propertyScope`; Legacy-NULL bleibt unsichtbar. Administrator- und MANAGER-Rechte
bleiben erhalten. Andere bestehende Gatewayansichten behalten in dieser Phase
ihre bisherigen gefilterten Device-Sichten. Neue Lifecycle-/Property-APIs und
vollständige UI-Anbindung, Installationsnachweis, Readiness, Public-Key-Enrollment,
Import-/Umzugsworkflow und manuelle PKI-Bestätigungsaktionen folgen in 1C-B.

## Manueller Provisioning-Workflow, Phase 1C-B

Die Phase-1C-A-Grundlage wird ohne Schemaänderung erweitert. Die folgenden
Regeln ersetzen die damaligen Übergangsausnahmen: Jede Gateway-Anlage braucht
eine tenantgesicherte Property; Propertywechsel einschließlich Legacy-NULL
verlangen null Devices und null offene Commands. MAINTENANCE → ACTIVE entfällt;
ein neuer PROVISIONING-Versuch mit eigenen Nachweisen ist erforderlich.

Die Plattform-API /api/platform/gateways/[id]/provisioning bietet GET für
Readiness und POST für bestätigte Lifecycle-, Property-, Installations-,
Public-Key- und Kommunikationsidentitätsaktionen. Jede öffentliche Serverfunktion
authentifiziert und prüft SUPER_ADMIN sowie expliziten Tenant selbst. POST nutzt
readBody mit Origin-/Größenprüfung, strikte Zod-Verträge und no-store-Antworten.
GET /api/platform/gateways/properties liefert nur Properties des explizit
gewählten Kunden. Bestehende POST-/Importpfade behalten dieselben Plattformgrenzen.

getGatewayProvisioningReadiness ist die zentrale abgeleitete Sicht; es gibt
kein weiteres gespeichertes Statusmodell. Ihre interne Transaktionsfunktion
liefert ausschließlich sichere Blockercodes, deutsche Erläuterungen und Schritte.
Die Aktivierung läuft mit Serializable-Isolation, Tenant-/Gateway-/Device-Sperren
und erneuter Readiness-Prüfung; Konflikte werden nicht automatisch als Erfolg
behandelt. Erst dann werden ACTIVE, commissionedAt, Revision und Audit atomar
geschrieben. Neue Commands und Identitätsänderungen serialisieren weiterhin
an der Gateway-Zeile. Geräte-/Modbus-Nachweise werden aus bestehenden Daten
geprüft, nicht aus dem letzten Commandresultat erraten.

Der historische firstContactAt bleibt unverändert. gateway.heartbeat-Audit wird
nur für neue akzeptierte Heartbeats und mit expliziter Serverzeit geschrieben,
nachdem der Gateway-Lock erworben wurde. Ein solches Ereignis nach dem aktuellen
provisioningStartedAt belegt den Kontakt dieses Versuchs; der geräteseitige
lastSeenAt ist dafür keine Alternative. Fehlende oder entfernte Audit-Evidenz
blockiert die Freigabe konservativ. Der bestehende Auditindex nach Tenant/Zeit
wird genutzt; für große Flotten bleibt dessen Performance zu beobachten.

Installation setzt installedAt ausschließlich bei bestätigter Vor-Ort-Installation
in PROVISIONING und schreibt ein gleichzeitiges gateway.installation.confirm-
Audit. Wiederholung ist idempotent. Ein historischer installedAt-Wert ohne dieses
Audit ist kein Nachweis. Propertywechsel löschen diesen Nachweis am Gateway.
Eine freie Datumsänderung wird nicht angeboten.

registerGatewayPublicKey akzeptiert ausschließlich Ed25519 SPKI-PEM mit PUBLIC
KEY-Begrenzern. Private-Key-PEM wird vor dem Krypto-Parser abgewiesen. Gespeichert
wird im bestehenden GatewayCredential-Modell; Antwort und Audit enthalten nur
ID/Fingerprint/Status/Ablauf. Private Keys entstehen lokal auf dem Gateway;
produktive HTTP-CREATE-/ROTATE-Pfade sind deaktiviert und die Credential-APIs
nehmen nur Widerruf an. Der lokale Demo-Seed ist auf SEED_DEMO=true, Nicht-
Produktion und Loopback-Datenbank begrenzt. Kein zweites Credentialmodell wird
angelegt.
Kommunikationsidentitäten sind weiterhin öffentliches Inventar. Manuelle
CONFIRM_ENABLED-, REQUEST_REVOCATION- und CONFIRM_REVOKED-Aktionen schreiben
Serverzeit und Audit unter Gateway-Sperre. Freischaltung setzt aktuelle Gültigkeit,
fehlenden Widerruf und nichtterminalen Lifecycle voraus. Ein bestätigter Widerruf
verlangt zuvor eine Anforderung; nach Stilllegung bleibt dessen Bestätigung möglich.
Ein offener Widerruf irgendeiner registrierten Identität blockiert Readiness.
Keine dieser Aktionen spricht Mosquitto, eine CA oder einen Broker an.

Die UI zeigt direkte Gateway-Property, Lifecycle getrennt von Online/Offline,
historischen Erstkontakt und letzten Kontakt, konkrete Provisionierungsschritte
und serverseitig zulässige Transitionen. Stilllegung unterscheidet Anwendungs-
sperre, Signaturwiderruf und externen Brokerwiderruf. Terminalität betrifft den
Gateway-Lifecycle, nicht automatisch Devices oder offline laufende Edge-Agenten.

## Nachweise der Modbus-Inbetriebnahme

`src/server/modbus-commissioning.ts` leitet den fachlichen Fortschritt aus gespeicherten Nachweisen ab: `DRAFT → CONFIGURED → CONNECTION_VERIFIED → READ_VERIFIED → ASSIGNMENT_CONFIRMED → COMMISSIONED`. Die vorhandenen Betriebszustände `NOT_CONFIGURED / COMMISSIONING / ACTIVE / FAULT / DISABLED` bleiben erhalten; `step` allein ist keine Freigabe. `COMMISSIONED` entspricht einem technisch und fachlich bestätigten Abschluss (`ACTIVE`, `completedAt`). Die angezeigte aktuelle Bereitschaft berücksichtigt weiterhin das bestehende Fünf-Minuten-Fenster; historische Abschlüsse und Auditnachweise bleiben gespeichert, auch wenn aktuelle Messdaten später fehlen.

Die Prüfung verlangt das neueste erfolgreiche TEST-Ergebnis für Mandant, Gerät, Gateway und Revision, mindestens einen durch die Ingestion validierten Messdatensatz und einen erfolgreichen Diagnosezähler samt Zeitstempel/Antwortzeit. Ein vorhandener neuer READ-Auftrag muss ebenfalls erfolgreich bestätigt sein. Die Ingestion validiert den vollständigen Registersatz gegen den gespeicherten Profilsnapshot; leere oder fehlerhafte Daten und widersprüchliche `ok/error`-Ergebnisse sind kein Erfolg. PENDING/EXPIRED werden nicht hochgestuft. Abgelaufene PENDING-Aufträge erscheinen auch ohne Gateway-Verbindung als EXPIRED; beim nächsten Gateway-Control-Aufruf wird der Ablauf persistiert.

REVIEW, ASSIGN und COMPLETE prüfen diese Nachweise unter den vorhandenen Gateway-/Geräte-/Zählersperren erneut und schreiben Bestätigung und AuditEvent atomar. Benutzer und Zeitpunkt der drei Bestätigungen werden gespeichert. Der Auditnachweis referenziert TEST-Command, Messdatensatz, Gateway und Konfigurationsrevision einschließlich Profil- und Kommunikationssnapshot; die strikt validierten Modbus-Parameter enthalten keine Zugangsdaten. Das Gateway bestätigt Ergebnisse ausschließlich über den vorhandenen authentifizierten Gerätekanal.

Jedes CONFIGURE erhöht die Revision, stoppt Polling, verwirft die aktuelle Diagnose und Bestätigungen und storniert alte PENDING-Aufträge. Historische Konfigurationen und Messdaten bleiben erhalten. Änderungen von Gateway, Zähler, Protokoll oder Profil eines bereits konfigurierten Geräts über den allgemeinen Geräteeditor werden abgelehnt und auf den Assistenten verwiesen. Dadurch kann ein Gateway-Wechsel außerhalb des Assistenten alte Nachweise nicht wiederverwenden. Die Reparaturmigration prüft ausschließlich TEST-EL-001 und protokolliert jede tatsächliche Rücksetzung; sie setzt keine anderen produktiven Inbetriebnahmen zurück.
