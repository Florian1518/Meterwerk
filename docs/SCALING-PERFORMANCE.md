# Scaling und Performance

## Baseline und Messmethode

Die folgenden Werte sind Engineering-Ziele für eine Staging-Umgebung, keine
Verfügbarkeits- oder Antwortzeitgarantie. Ein reproduzierbarer Lauf verwendet
eine definierte Zahl von Tenants, Properties, Metern, Devices und Readings,
misst p50/p95/p99 sowie SQL-Abfragen und dokumentiert Hardware, Datenbank und
Cache. Der vorhandene Protokoll-Lasttest erzeugt standardmäßig synthetische
Adapterdaten (100 Geräte mit je 96 Readings); er schreibt ohne ausdrücklich
konfigurierte lokale Datenbank nicht in PostgreSQL. Deshalb gibt es aktuell
keine belastbare produktive Antwortzeitmessung.

Zu messen sind Dashboard, Analytics, Zählerliste, zeitbereichsbegrenzte
Readings-API, Fleet Overview, Support/Operations, WorkOrders und Public API.
Bekannte Hotspots sind große, fachlich begrenzte Exporte in
`customer-portal.ts`, Datenqualitätsfenster, Modbus-/Utility-Fenster und
Analytics über viele Meter. Diese Pfade behalten ein hartes Limit; große
Exporte müssen in Chunks erfolgen.

## Indizes und Query-Strategie

Alle fachlichen Abfragen bleiben tenantgebunden. Readings besitzen nun
zusätzliche zusammengesetzte Indizes für `(tenantId, meterId, timestamp)` und
`(tenantId, deviceId, timestamp)`. Alarme werden für die häufige offene-
Alarm-Sortierung über `(tenantId, status, createdAt)` unterstützt. Bestehende
Indizes decken WorkOrders, Jobs, Webhooks, Supportfälle, Incidents und
AuditEvents ab; es werden keine Indizes pauschal für jede Spalte angelegt.

Listen verwenden eine maximale Seitengröße von 100 und bevorzugt Cursor-
Pagination. Relationen werden nur selektiv geladen. Rohdatenabfragen müssen
Zeitbereich, Tenant und betroffene IDs einschränken; ungebremste
Hunderttausende-Zeilen-Antworten sind nicht zulässig.

## Readings und Analytics

Rohmesswerte bleiben die Source of Truth. Zeitreihen werden immer nach Tenant,
Meter/Device und UTC-Zeitfenster gelesen; Exporte sind auf 10.000 Rohzeilen je
Chunk begrenzt. Stunden- und Tages-Buckets können inkrementell aufgebaut und
bei Korrekturen über das betroffene Zeitfenster invalidiert bzw. neu berechnet
werden. Ein Rebuild liest ausschließlich die Rohdaten und ist damit
nachvollziehbar. Analytics nutzt Aggregationen für Übersichten und Rohdaten für
Drill-down, Korrekturen und Prüfungen.

## Pagination, Limits und API-Schutz

`src/lib/performance.ts` zentralisiert Seitengrößen, maximale Reading-Fenster,
Exportlimits, deterministische UTC-Buckets sowie Backoff-/Lease-Hilfen. Die
Public API begrenzt `limit` bereits auf 100, nutzt Cursor und liefert nur
selektierte Felder. Zeitfenster und Exportgrößen werden serverseitig validiert;
bei Überschreitung ist in mehreren Chunks anzufordern. Rate-Limits und
Correlation-IDs der Public API bleiben aktiv.

## Caching

Nur statische Referenzdaten, Device Profiles und kurzlebige Analytics-
Ergebnisse dürfen gecacht werden. Jeder Schlüssel wird mit
`tenant:<tenantId>` gebildet; Secrets und Live-Status werden nicht gecacht.
TTL und Invalidierung müssen zur fachlichen Aktualität passen.

## Worker, Queues und Concurrency

Persistente Jobs brauchen Status-, `nextAttemptAt`- und Lease-Felder. Worker
sollen Jobs atomar claimen (transaktional, mit Lease), bei Ablauf erneut
claimen und mit exponentiellem Backoff sowie Retry-Limit arbeiten. Eindeutige
Event-/Message-IDs und vorhandene Unique Constraints sichern Idempotenz.
Mehrere Instanzen dürfen dadurch denselben Job nicht gleichzeitig ausführen.
Diese Regeln gelten für Rules, Rollouts, Notifications, Mail, Reports,
Webhooks und Device Commands. Ingestion, Credential Rotation,
Alarm-Erstellung, WorkOrder-Status und Support-Retries bleiben in Transaktionen
tenantgebunden.

Backpressure wird über Queue-Lag und Backlog klassifiziert: ab 100 wartenden
Jobs WARNING, ab 1.000 CRITICAL. Batchgrößen und Parallelität sind begrenzt;
Retries verwenden Backoff. Die Queue-Ansicht soll Request-Dauer, Query-Dauer,
Lag, Durchsatz, Fehlschläge, Ingestion-Rate, Aggregations- und Exportdauer
anzeigen.

## Connection Pooling

Web- und Worker-Prozesse verwenden den zentralen Prisma/pg-Pool. Jede Instanz
erhält eine begrenzte Poolgröße (zum Beispiel `connection_limit` im
Deployment-URL) und wird entsprechend der PostgreSQL-MaxConnections skaliert.
Neue Instanzen dürfen nicht ungeprüft vervielfacht werden. Healthchecks und
Graceful Shutdown verhindern, dass beim Deployment Verbindungen hängen bleiben.

## Zeitreihen-Partitionierung und Retention

Für sehr große `Reading`-Tabellen ist eine PostgreSQL-Partitionierung nach
UTC-Zeit (monatlich oder wöchentlich) mit Tenant-/Meter-Indizes vorgesehen.
Die Einführung erfolgt expand/contract: neue Partitionen und Indizes zuerst,
Backfill in begrenzten Chunks, Validierung, danach kontrolliertes Umschalten.
Es gibt keinen automatischen Datenverlust. Rohmesswerte, Analytics-Buckets,
Events/Audit, Queue-Historie und Support-/Incident-Daten erhalten separate,
tenantgebundene, konfigurierbare Retention-Regeln. Jede Archivierung oder
Löschung wird als AuditEvent erfasst und berücksichtigt gesetzliche bzw.
vertragliche Aufbewahrung, ohne diese Werte im Code zu erfinden.

## Aggregationen und Exporte

Stunden- und Tages-Buckets werden inkrementell aus neuen Rohdaten aktualisiert.
Korrekturen invalidieren das betroffene Bucket-Fenster; ein Rebuild kann dieses
Fenster oder einen Tenant vollständig aus Rohdaten neu aufbauen. Übersichten
verwenden Buckets, Drill-downs und Prüfungen Rohdaten. Große Exporte laufen als
begrenzte Hintergrundjobs mit Streaming/Chunking und signierten, tenantgeprüften
Downloads; Rohzeilen werden nie vollständig im RAM gesammelt.

Teure Analytics, große Zeitfenster und Exporte unterliegen tenantbezogenen und
globalen Limits. Bei Überschreitung wird ein verständlicher 4xx-Fehler oder ein
Job-Status zurückgegeben.

## Load Tests und Budgets

Synthetische Lasttests dürfen nur lokale oder CI-Daten verwenden und decken
parallele Readings, viele Devices/Tenants, Dashboard, Analytics, Public API und
Webhook-/Job-Verarbeitung ab. EXPLAIN/ANALYZE wird mit PostgreSQL in CI bzw.
Staging für die kritischen Pfade wiederholt.

| Bereich                     | Ziel (p95, Engineering) |
| --------------------------- | ----------------------: |
| Dashboard                   |              < 1.000 ms |
| einfache Listen             |                < 500 ms |
| Readings-Fenster (begrenzt) |              < 1.000 ms |
| Analytics-Übersicht         |              < 2.000 ms |
| Public API                  |                < 500 ms |
| Queue-Verarbeitung          |  100 Jobs/Minute/Worker |

Ziele gelten für eine dokumentierte Staging-Datenmenge und werden bei
steigender Flottengröße neu vermessen. PostgreSQL-Integration, EXPLAIN und
persistente Lasttests waren lokal wegen `P1001/ECONNREFUSED` nicht ausführbar;
der CI-Service muss dafür eine frische Testdatenbank bereitstellen.

## DB-Lasttests und EXPLAIN

Der reproduzierbare CI-Lauf soll 100 Tenants, 10.000 Devices, parallele
Readings, Dashboard, Analytics, Public API, mehrere Worker, Queue-Verarbeitung
und große Exporte erzeugen. Für Readings-Zeitbereiche, letzte Messwerte,
Analytics, Fleet, WorkOrders, AuditEvents und Queue-Claims werden
`EXPLAIN (ANALYZE, BUFFERS)`-Pläne mit Datenmenge, Parallelität und p50/p95/p99
gespeichert. Diese Nachweise sind erst gültig, wenn PostgreSQL erreichbar ist.

## Regression Gates und Capacity Model

`npm run performance:gate -- <result.json>` prüft p95 und Fehlerquote für
Dashboard, Readings, Analytics, Public API, Fleet, Queue-Claiming und Worker.
Fehlende Messwerte schlagen den Gate absichtlich fehl. Die Budgets sind
Engineering-Ziele: p95 < 1.000 ms für Dashboard/Readings/Fleet, < 2.000 ms für
Analytics/Worker, < 500 ms für Public API/Queue-Claiming und Fehlerquote < 1 %.
Maximal 100 Datensätze je Seite, 366 Tage Reading-Zeitfenster und 10.000
Reading-Exportzeilen je Chunk gelten als harte Schutzgrenzen.

Das Capacity Model beschreibt Tenants, Properties, Meter, Devices, Gateways,
Readings pro Minute, gespeicherte Readings, API-Anfragen, Worker, Queue-Größe,
Analytics und Exporte. Es ist ein Planungsmodell ohne Kapazitätsversprechen.
Zuerst skalieren typischerweise PostgreSQL-I/O und Reading-Indizes, danach
Ingestion-/Queue-Worker, Analytics-Aggregation und Export-Worker. Anschließend
werden API/Web-Instanzen horizontal ergänzt; Poolgrößen müssen dabei unter
PostgreSQLs `max_connections` bleiben.

## Web- und Datenbank-Resilienz

Web-Instanzen halten keinen tenantkritischen Zustand ausschließlich im lokalen
Prozessspeicher. Sessions, Locks und Leases liegen in den persistenten
Backends. Readiness prüft notwendige Abhängigkeiten, Liveness bleibt für den
Prozess separat. Graceful Shutdown stoppt neue Arbeit, lässt laufende Requests
auslaufen und gibt Worker-Leases durch Ablauf frei.

Poolgröße und Timeouts werden je Instanz über die Datenbank-URL bzw.
Deployment-Umgebung begrenzt (`connection_limit`, Connect-/Query-Timeout).
Retries gelten nur für sichere transiente Operationen und haben ein festes
Limit. Bei Datenbankausfall melden Health-Endpunkte DEGRADED/CRITICAL und
Schreibvorgänge schlagen sichtbar fehl; es werden keine Erfolge simuliert.

## Failover und Recovery

Worker verwenden `leaseOwner`/`lockedUntil`, reclaimen abgelaufene Leases und
setzen begrenzte Retries mit Backoff. Terminal fehlgeschlagene Jobs bleiben im
Fehler-/Dead-Letter-Status. Event-/Message-Unique-Constraints und der
Lease-Besitzer verhindern konkurrierende Abschlussupdates. Ein Neustart darf
keine lokale Lock-Datei oder lokalen Queue-Zustand voraussetzen.

## Reproduzierbare Skripte und Monitoring

`npm run performance:fixture` erzeugt ausschließlich sichere synthetische
Fixture-Metadaten (keine DB-Schreibvorgänge). PostgreSQL-Lasttests laufen in CI
gegen eine frische Datenbank; Ergebnisse enthalten Datenmenge, Parallelität,
Umgebung, Median, p95, Fehlerquote und Queue-Lag. EXPLAIN läuft mit
`EXPLAIN (ANALYZE, BUFFERS)` für Reading-Zeitbereiche, letzte Messwerte,
Analytics, Fleet, WorkOrders, AuditEvents und Queue-Claims. Testdaten dürfen
nur anhand eines expliziten Testmarkers bereinigt werden.

Monitoring umfasst Request-/DB-Dauer, Ingestion-Rate, Queue-Lag,
Worker-Durchsatz und -Fehler, Analytics-, Export- und Aggregationsdauer. Es
werden keine Payloads oder Secrets als Metrik gespeichert.
