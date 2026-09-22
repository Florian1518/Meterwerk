# CSV-Datenimport

Der Menüpunkt **Datenimport** ist für TENANT_ADMIN und nach expliziter Mandantenauswahl für SUPER_ADMIN verfügbar. Manager und USER können keine Importe ausführen. Unterstützt werden Liegenschaften, Gebäude, Nutzungseinheiten, Zähler, Devices, Gateways und historische Messwerte. Benutzerkonten werden über Einladungen mit Einmal-Link angelegt; Passwortimporte sind nicht vorgesehen.

## Ablauf und Sicherheit

Die UTF-8-CSV-Datei wird mit maximal 5 MB und 2.000 Datenzeilen angenommen. Komma- und Semikolontrennung, BOM und doppelte Anführungszeichen werden erkannt. Nach Spaltenzuordnung speichert Meterwerk die serverseitige Vorschau für 30 Minuten. Sie enthält ausschließlich normalisierte Werte, Prüffehler und einen Dateifingerabdruck. Die Bestätigung ist an den ursprünglichen Benutzer und Mandanten gebunden und kann nur einmal erfolgen.

Vor der Vorschau werden Verweise ausschließlich im ausgewählten Tenant nachgeschlagen. Vor dem Schreiben werden die Zuordnungen erneut geprüft; Datenbank-Fremdschlüssel sichern die Hierarchie zusätzlich. Beim Bestätigen sperrt Meterwerk den Tenant, prüft die Ressourcenlimits und fügt den ganzen Batch sowie ein AuditEvent in einer Transaktion ein. Bei einem Fehler wird alles zurückgerollt. Vorhandene Daten werden nicht überschrieben. Vorschauen verfallen nach 30 Minuten.

## Spalten

Die Spaltennamen werden durch den Benutzer den folgenden Feldschlüsseln zugeordnet. `id` ist optional und kann beim Anlegen von Stammdaten explizit vergeben werden. Fremdschlüssel verwenden bestehende IDs im selben Tenant. Mehrstufige Stammdatenimporte erfolgen daher in Reihenfolge: Liegenschaften, Gebäude, Nutzungseinheiten, Zähler, Devices.

| CSV-Ziel          | Pflichtfelder                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Liegenschaften    | `name`, `address`, `city`                                                                                                   |
| Gebäude           | `propertyId`, `name`                                                                                                        |
| Nutzungseinheiten | `buildingId`, `name`, `floor`, `area`                                                                                       |
| Zähler            | `unitId`, `serialNumber`, `type`, `manufacturer`, `model`, `measurementUnit`, `location`, `installedAt`, `demoPricePerUnit` |
| Devices           | `meterId`, `externalDeviceId`, `manufacturer`, `model`, `protocol`, `installedAt`                                           |
| Gateways          | `name`, `externalGatewayId`, `manufacturer`, `model`, `installedAt`                                                         |
| Messwerte         | `meterId`, `timestamp`, `registerValue`, `consumption`, `measurementUnit`                                                   |

Optionale Felder umfassen `id`, Status, Firmware, externe ID sowie bei Messwerten `deviceId`, `messageId`, `meterValue` und `source`. Enumwerte entsprechen den technischen Feldwerten (zum Beispiel `ELECTRICITY`, `MODBUS`, `MANUAL`).

## Zahlen und Zeit

Deutsche Zahlenformate wie `1.234,56` sowie einfache Dezimalpunkte werden akzeptiert. Werte bleiben Dezimalstrings bis zur PostgreSQL-Decimal-Spalte; JavaScript-Gleitkommaarithmetik wird nicht verwendet. UTF-8 ist verpflichtend. Datum-only-Werte wie `23.09.2026` werden als UTC-Mitternacht gespeichert. Zeitstempel müssen UTC (`Z`) oder einen expliziten UTC-Offset enthalten; beispielsweise wird `23.09.2026 14:30:00+02:00` als `2026-09-23T12:30:00Z` gespeichert. Lokale Uhrzeiten ohne Offset werden abgelehnt, damit Sommerzeitwechsel nicht mehrdeutig interpretiert werden.

Messwerte müssen einen Tenant-eigenen Zähler, eine zum Zähler passende Einheit und einen gültigen Zeitstempel haben. Doppelte `(Tenant, Zähler, Zeitpunkt, Quelle)`-Kombinationen und wiederverwendete Device-`messageId` werden abgewiesen. Zähler-Seriennummern, Gateway- und Device-IDs sowie explizite Datensatz-IDs werden auf vorhandene und CSV-interne Duplikate geprüft.

Ein abgeschlossener Import erzeugt `data_import.completed` im AuditLog. Fehlerdetails sind zeilenbezogen; bei jedem kritischen Fehler bleibt der gesamte Batch unverändert.
