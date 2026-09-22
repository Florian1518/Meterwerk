# Meterwerk Public API v1

Die öffentliche, ausschließlich lesende API ist unter `/api/public/v1/` verfügbar. Sie ist mandantengebunden und nutzt dieselben serverseitigen Tenant- und Feature-Prüfungen wie das Portal. Eine echte Geräte- oder Hardwareanbindung ist nicht Teil dieser API.

## API-Schlüssel

Tenant-Administratoren verwalten Schlüssel unter **Public API-Keys**. Ein Schlüssel hat einen Namen, optionale Beschreibung und Ablaufzeit sowie mindestens einen Scope. Das vollständige Bearer-Secret wird genau einmal bei der Erstellung angezeigt. Persistiert wird ausschließlich sein SHA-256-Hash. Schlüssel können jederzeit widerrufen werden; `lastUsedAt` zeigt den letzten authentifizierten Aufruf.

Die Portal-Verwaltung verwendet die angemeldete Meterwerk-Sitzung und CSRF-Schutz. Die Management-Routen sind `GET /api/api-keys?tenantId=…`, `POST /api/api-keys` und `DELETE /api/api-keys?id=…&tenantId=…`. Erstellen und Widerrufen sind ausschließlich TENANT_ADMIN erlaubt. SUPER_ADMIN kann Diagnosemetadaten ansehen, aber keine Schlüssel erzeugen oder widerrufen. API-Verfügbarkeit wird durch das Tenant-Planfeature `API` geprüft.

Jeder Schlüssel gehört genau einem Tenant. Die API nimmt keinen Tenant zur Auswahl an. Alle Ressourcenzugriffe erzwingen `tenantId` aus dem gespeicherten Schlüssel; ein abweichender `tenantId`-Queryparameter wird abgelehnt. Abgelaufene, falsche und widerrufene Schlüssel erhalten dieselbe generische 401-Antwort.

## Scopes und Ressourcen

| Scope             | Ressource     |
| ----------------- | ------------- |
| `properties:read` | `/properties` |
| `buildings:read`  | `/buildings`  |
| `units:read`      | `/units`      |
| `meters:read`     | `/meters`     |
| `readings:read`   | `/readings`   |
| `alarms:read`     | `/alarms`     |
| `reports:read`    | `/reports`    |

Anfragen benötigen `Authorization: Bearer <API-KEY>`. Zusätzlich erzwingen Plan-Features serverseitig beispielsweise API-Verfügbarkeit und Reporting-Zugriff.

## Pagination und Zeiträume

Listen verwenden `limit` (Standard 50, Maximum 100) und `cursor` aus `pagination.nextCursor`:

```text
GET /api/public/v1/readings?limit=50&from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z
```

`from` ist inklusiv und `to` exklusiv. Beide Werte müssen ISO-8601-Zeitstempel mit Zeitzone sein und intern werden Zeiträume als UTC-Zeitpunkte gefiltert. Zeitfilter stehen für Messwerte, Alarme und Reports zur Verfügung.

Erfolgreiche Listen antworten mit `{ "data": [...], "pagination": { "limit": 50, "nextCursor": "..." }, "correlationId": "..." }`. Ist keine weitere Seite vorhanden, ist `nextCursor` `null`.

## Fehler, Limits und Betrieb

Fehler haben JSON-Form `{ "error": "...", "correlationId": "..." }`.

| HTTP-Code | Bedeutung                                                |
| --------- | -------------------------------------------------------- |
| 400       | Ungültige Ressource, Pagination oder Zeitfilter          |
| 401       | Schlüssel fehlt, ist falsch, abgelaufen oder widerrufen  |
| 403       | Feature, Scope oder Tenant-Zugriff nicht freigegeben     |
| 429       | Rate-Limit überschritten; `Retry-After` enthält Sekunden |
| 500       | Unerwarteter Serverfehler mit Correlation-ID             |

Nicht vorhandene URL-Pfade liefern den normalen HTTP-404-Fehler der Anwendung. `X-Correlation-ID` wird für Support und Logs zurückgegeben. Ein syntaktisch gültiger eingehender `X-Correlation-ID` wird übernommen, andernfalls erzeugt der Server eine UUID. Antworten enthalten `Cache-Control: private, no-store`.

Das Limit beträgt standardmäßig 120 Anfragen pro API-Schlüssel und gleitendem 60-Sekunden-Fenster; 429-Antworten enthalten `Retry-After`. Der Zähler liegt in PostgreSQL und wird atomar aktualisiert, sodass mehrere Anwendungsinstanzen dasselbe Limit beachten.

Die API ist lesend. Schreiboperationen, Zahlungsvorgänge und echte Hardwareverbindungen sind nicht enthalten. Jeder Aufruf muss über HTTPS erfolgen; Secrets dürfen weder protokolliert noch in Clientcode eingebettet werden.

## Endpunkte

| Methode und Pfad                | Scope             | Beschreibung                                                    |
| ------------------------------- | ----------------- | --------------------------------------------------------------- |
| `GET /api/public/v1/`           | gültiger API-Key  | API-Version und mit dem Schlüssel verfügbare Ressourcen         |
| `GET /api/public/v1/properties` | `properties:read` | Liegenschaften                                                  |
| `GET /api/public/v1/buildings`  | `buildings:read`  | Gebäude mit Liegenschafts-ID                                    |
| `GET /api/public/v1/units`      | `units:read`      | Nutzungseinheiten mit Gebäude-ID                                |
| `GET /api/public/v1/meters`     | `meters:read`     | Zähler und Status                                               |
| `GET /api/public/v1/readings`   | `readings:read`   | Messwerte; `from`/`to` sind UTC-Zeitfilter                      |
| `GET /api/public/v1/alarms`     | `alarms:read`     | Alarme; `from`/`to` filtern Erstellzeit                         |
| `GET /api/public/v1/reports`    | `reports:read`    | Reports; zusätzlich muss das Planfeature `REPORTING` aktiv sein |

Eine maschinenlesbare OpenAPI-3.1-Beschreibung liegt unter [`docs/openapi/public-api-v1.yaml`](openapi/public-api-v1.yaml). Sie beschreibt die versionierten öffentlichen Leseendpunkte; die oben aufgeführten `/api/api-keys`-Routen sind Portal-Management und verwenden keine Public-API-Bearer-Keys.

### Beispiel

```sh
curl --fail-with-body \
  -H 'Authorization: Bearer <API-KEY>' \
  -H 'X-Correlation-ID: client-request-0001' \
  'https://meterwerk.example/api/public/v1/readings?limit=50&from=2026-09-01T00%3A00%3A00Z&to=2026-10-01T00%3A00%3A00Z'
```

Antworten enthalten `data`, `pagination` und `correlationId`. Messwerte enthalten Dezimalwerte als serialisierte Dezimalzahlen und Zeitstempel als ISO-8601-UTC. Ressourcenfelder sind auf lesbare Integrationsdaten begrenzt; interne Secrets und Credentials werden nie ausgegeben.
