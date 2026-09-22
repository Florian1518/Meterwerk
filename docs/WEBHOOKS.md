# Tenant Webhooks

Webhook-Konfigurationen gehören zu genau einem Tenant. TENANT_ADMIN kann Endpunkte verwalten, testen und die Historie sehen. SUPER_ADMIN kann nach expliziter Tenant-Auswahl Integrationen diagnostizieren, erhält aber weder API-Key- noch Webhook-Secrets und kann keine Tenant-Integrationen ändern. Das Feature `WEBHOOKS` wird beim Erstellen/Aktivieren und beim Testversand serverseitig geprüft; bestehende Zustellungen bleiben diagnostizierbar. Ein Endpunkt enthält Name, URL, Eventauswahl, Aktivstatus, Erstellungs- und letzte Zustellzeit. Secrets werden mit AES-256-GCM verschlüsselt gespeichert und nur bei Erstellung vollständig angezeigt. Für Produktion ist `WEBHOOK_SECRET_ENCRYPTION_KEY` als unabhängiges, zufälliges Secret mit mindestens 32 Bytes erforderlich.

Die Portal-Routen verwenden die Meterwerk-Sitzung und CSRF-Origin-Prüfung bei Mutationen:

| Methode und Pfad                          | Funktion                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/webhooks?tenantId=…`            | Tenant-Konfigurationen ohne Secret sowie bis zu 50 jüngste Zustellungen                         |
| `POST /api/webhooks`                      | Endpoint mit Name, `url`, `events` und optionalem `active` anlegen; liefert das Secret einmalig |
| `PATCH /api/webhooks/{id}?tenantId=…`     | Name, URL, Eventauswahl oder Aktivstatus aktualisieren                                          |
| `DELETE /api/webhooks/{id}?tenantId=…`    | Endpoint deaktivieren/archivieren; Zustellhistorie bleibt erhalten                              |
| `POST /api/webhooks/{id}/test?tenantId=…` | `webhook.test`-Zustellung in die Outbox stellen; Antwort `202` mit Delivery-ID                  |

Ein Testversand wird wie jede Zustellung signiert und ist in der Historie sichtbar. Er benötigt den `mqtt-worker`; ohne Worker bleibt er `PENDING`.

Beispiel zum Anlegen (die Portal-Sitzung und `Origin` werden vom Browser gesendet):

```json
{
  "tenantId": "tenant-123",
  "name": "Messwert-Integration",
  "url": "https://integrator.example/hooks/meterwerk",
  "events": ["meter.reading.received", "alarm.created"],
  "active": true
}
```

Die `201`-Antwort enthält Metadaten und einmalig `secret: "mwk_whsec_…"`. `GET` liefert Endpoint-Metadaten plus `deliveries` (höchstens 50, neueste zuerst); Encrypted-Secret-Felder sind weder in `GET`-Antworten noch im SUPER_ADMIN-Diagnosebereich enthalten. Testversand-Anfrage ist `{}`; Antwort: `{ "deliveryId": "…", "status": "PENDING" }`.

## Events und Payload

Verfügbare Events sind `meter.reading.received`, `meter.offline`, `meter.online`, `gateway.offline`, `gateway.online`, `alarm.created`, `alarm.acknowledged`, `alarm.resolved` und `report.ready`. Zustellpayloads haben die Form:

```json
{
  "id": "stable-delivery-id",
  "event": "meter.reading.received",
  "occurredAt": "2026-09-23T12:00:00.000Z",
  "data": { "meterId": "…", "readingId": "…" }
}
```

Weitere `data`-Beispiele (IDs sind Tenant-lokale Ressourcen-IDs; Daten werden nur für passende abonnierte Events beigelegt):

```json
{"id":"evt-1","event":"alarm.created","occurredAt":"2026-09-23T12:00:00.000Z","data":{"alarmId":"alarm-1","meterId":"meter-1","severity":"HIGH","title":"Messwert überschritten"}}
{"id":"evt-2","event":"gateway.offline","occurredAt":"2026-09-23T12:01:00.000Z","data":{"gatewayId":"gateway-1"}}
{"id":"evt-3","event":"report.ready","occurredAt":"2026-09-23T12:02:00.000Z","data":{"reportId":"report-1","type":"MONTHLY","title":"September","periodFrom":"2026-09-01T00:00:00.000Z","periodTo":"2026-10-01T00:00:00.000Z"}}
{"id":"evt-test","event":"webhook.test","occurredAt":"2026-09-23T12:03:00.000Z","data":{"test":true,"webhookName":"Messwert-Empfänger"}}
```

Die weiteren `data`-Felder sind: `meter.reading.received` enthält `readingId`, `meterId`, `timestamp`, `value`, `consumption` und `unit`; `meter.offline`/`meter.online` enthalten `meterId` und `deviceId`; `gateway.online` enthält `gatewayId` und `lastSeenAt`; `alarm.acknowledged`/`alarm.resolved` enthalten `alarmId`, `meterId` und Status. Die obigen Beispiele zeigen `gateway.offline`, `alarm.created` und `report.ready`.

Aufträge werden als transaktionale Outbox gemeinsam mit der fachlichen Änderung angelegt. Der Worker verarbeitet sie wiederholbar und mandantengefiltert. Inaktive Endpunkte erhalten keine neuen Aufträge; bereits wartende Aufträge werden beim Versand abgebrochen, wenn der Endpunkt deaktiviert wurde.

## Signatur und Replay-Schutz

Jeder POST enthält `X-Meterwerk-Event`, `X-Meterwerk-Delivery`, `X-Meterwerk-Timestamp` (Unix-Sekunden) und `X-Meterwerk-Signature` im Format `t=<timestamp>,v1=<hex-hmac>`. Der HMAC-SHA256 wird über UTF-8-Bytes von `timestamp.deliveryId.rawBody` gebildet. Empfänger müssen den Timestamp-Header mit `t` vergleichen, zuerst das Zeitfenster (maximal fünf Minuten), dann die Signatur über den unveränderten Request-Body prüfen und die Delivery-ID atomar als Idempotency-Key speichern. Bereits verarbeitete IDs sind zu ignorieren. Die stabile ID bleibt bei Retries gleich, der Timestamp und die Signatur werden für jeden Versuch erneuert.

Produktive URLs müssen HTTPS verwenden. Zugangsdaten, localhost, private Netzwerkadressen und DNS-Ziele, die auf private Adressen auflösen, werden blockiert; Redirects werden nicht verfolgt. Requests haben acht Sekunden Timeout. Logs enthalten weder URL, Secret, Request-Body noch Receiver-Antwort.

## Retry und Historie

Nicht erfolgreiche Statuscodes und Verbindungsfehler werden mit exponentiellem Backoff (2 Sekunden, Verdopplung, maximal eine Stunde) bis zu achtmal wiederholt. Danach wird der Auftrag als `DEAD_LETTER` abgelegt. Die Historie speichert Status, Versuchszahl, HTTP-Statuscode, letztes Versuchsdato und einen bereinigten Fehlergrund, aber keine Secrets oder vollständigen Antworten. Tenant-Administratoren sehen die letzten 50 Zustellungen auf der Webhook-Seite.

Die Bereitstellung benötigt den separaten Worker `mqtt-worker`, der die Zustell-Outbox im Hintergrund abarbeitet. Ein Zahlungsanbieter oder reales Hardwareziel wird dadurch nicht angebunden.
