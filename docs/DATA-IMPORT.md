# CSV-Import und Export

## Ablauf und Rechte

Unter `/imports` können TENANT_ADMIN und SUPER_ADMIN CSV-Dateien prüfen, Spalten zuordnen, fehlerhafte Zeilen gesammelt überspringen und die verbleibenden Daten atomar übernehmen. SUPER_ADMIN muss einen Mandanten auswählen. Vorschau, Fehlerbearbeitung und Bestätigung sind an Mandant und Ersteller gebunden. MANAGER und USER dürfen nicht importieren; die Import-Historie ist ebenfalls nur für Administratoren zugänglich.

1. Datentyp und Datei wählen; die erste Vorschau schlägt passende Spaltennamen vor.
2. Feldzuordnung kontrollieren und über „Zuordnung prüfen“ erneut validieren.
3. Fehler in der Ursprungsdatei korrigieren und erneut hochladen oder ausgewählte fehlerhafte Zeilen mit Begründung überspringen. Dateiweite Fehler (Zeile 0), etwa fehlende Pflichtzuordnungen, lassen sich nicht überspringen.
4. Vorschau prüfen und innerhalb von 30 Minuten bestätigen. Jeder verbleibende Fehler blockiert die Übernahme. Keine automatische Bestätigung nach einer Sammelbearbeitung.

Eine Datei enthält genau einen Datentyp. Eltern müssen bereits existieren: Liegenschaft → Gebäude → Nutzungseinheit → Zähler → Device; Gateways vor ihrer Device-Zuordnung importieren. IDs anderer Mandanten werden abgelehnt. Importe erzeugen keine Geräteverbindung und enthalten keine Credentials oder Benutzerpasswörter.

## CSV-Struktur

- UTF-8 mit optionalem BOM, maximal 5 MiB und 2.000 Datenzeilen pro Vorschau; größere Importe in Dateien teilen.
- Kopfzeile mit mindestens zwei eindeutigen, nicht leeren Spaltennamen. Groß-/Kleinschreibung wird beim Erkennen doppelter Überschriften ignoriert.
- Komma oder Semikolon als Trennzeichen, anhand der Kopfzeile erkannt. Für deutsche Dezimalzahlen empfiehlt sich Semikolon.
- Felder mit Trennzeichen oder Zeilenumbrüchen in doppelte Anführungszeichen setzen; innere Anführungszeichen verdoppeln. LF und CRLF werden unterstützt; vollständig leere Zeilen werden ignoriert.
- Alle Zeilen müssen dieselbe Spaltenanzahl wie die Kopfzeile haben. Fehlerzeilen werden als logische Datensätze ab 2 nummeriert; bei mehrzeiligen Feldern sind dies keine physischen Textzeilen.
- Die Vorschau zeigt zehn Datensätze und höchstens 100 Fehlermeldungen. Nach einer Fehlerbearbeitung werden die verbleibenden Meldungen sichtbar.

```csv
meterId;timestamp;registerValue;consumption;measurementUnit;source
EIGENE_ZAEHLER_ID;2026-01-15T10:00:00+01:00;1.234,56;2,50;kWh;MANUAL
```

## Feldzuordnung und Datentypen

Die Zuordnung ist ein Objekt `Zielfeld: CSV-Spaltenname`. Nur definierte Zielfelder werden übernommen. Nicht zugeordnete Zusatzspalten werden ignoriert; frei übergebene Request-Felder werden nicht in Fachobjekte kopiert. Optionale `id`-Werte dürfen keine bestehenden Datensätze überschreiben; ohne ID wird eine neue erzeugt.

| Ressource                          | Pflichtfelder                                                                                                               | Optionale Felder                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `properties` – Liegenschaften      | `name`, `address`, `city`                                                                                                   | `id`                                            |
| `buildings` – Gebäude              | `propertyId`, `name`                                                                                                        | `id`                                            |
| `units` – Nutzungseinheiten        | `buildingId`, `name`, `floor`, `area`                                                                                       | `id`                                            |
| `meters` – Zähler                  | `unitId`, `serialNumber`, `type`, `manufacturer`, `model`, `measurementUnit`, `location`, `installedAt`, `demoPricePerUnit` | `id`, `externalDeviceId`, `status`              |
| `devices` – Devices                | `meterId`, `externalDeviceId`, `manufacturer`, `model`, `protocol`, `installedAt`                                           | `id`, `gatewayId`, `firmwareVersion`, `status`  |
| `gateways` – Gateways              | `name`, `externalGatewayId`, `manufacturer`, `model`, `installedAt`                                                         | `id`, `firmwareVersion`, `status`               |
| `readings` – historische Messwerte | `meterId`, `timestamp`, `registerValue`, `consumption`, `measurementUnit`                                                   | `deviceId`, `messageId`, `meterValue`, `source` |

Zählermedien: `ELECTRICITY`, `WATER`, `GAS`, `HEAT`. Zählerstatus: `ACTIVE` (Standard), `OFFLINE`, `MAINTENANCE`. Device-/Gatewaystatus: `ONLINE`, `OFFLINE`, `WARNING`, `MAINTENANCE` (Standard), `DISABLED`.

Protokolle: `VIRTUAL`, `REST`, `MQTT`, `MODBUS`, `MBUS`, `WMBUS`, `LORAWAN`, `VENDOR_API`, `MODBUS_RTU`, `MODBUS_TCP`, `PULSE`. Messwertquellen: `DEMO`, `REST`, `MQTT`, `GATEWAY`, `MANUAL` (Standard). Enum-Werte werden in Großbuchstaben normalisiert. Die Speicherung einer Protokollbezeichnung startet keine Integration. Benutzer werden weiterhin über den separaten Einladungsprozess angelegt.

## Datum, Zeit und Dezimalzahlen

Datumswerte `YYYY-MM-DD` und `DD.MM.YYYY` bedeuten **00:00 UTC**. Uhrzeiten benötigen einen expliziten Offset oder `Z`: z. B. `2026-01-15T10:30:00Z`, `2026-01-15T11:30:00+01:00` oder `15.01.2026 11:30:00+01:00`. Kalenderungültige Daten und Uhrzeiten ohne Zeitzone werden abgelehnt. Gespeichert wird UTC; Sommerzeit wird nicht geraten.

Dezimalwerte erlauben `1234.56`, `1234,56` und `1.234,56`. Tausendertrennung mit Punkt wird nur bei vorhandenem Dezimalkomma aufgelöst: `1.234` bedeutet daher **1,234**, nicht 1234. Wissenschaftliche Notation und uneindeutige Mischformate sind nicht zulässig. Der bestehende Parser entfernt Leerraum und Eurozeichen. Messwerte werden als Decimal-Strings verarbeitet, niemals über JavaScript-Gleitkommazahlen gerundet.

Speichergrenzen werden bereits in der Vorschau geprüft: Messwerte Decimal(20,6), Fläche Decimal(12,2), Demo-Preis Decimal(10,4). Zusätzliche Nachkommastellen oder zu große Beträge werden abgelehnt. Fläche, Demo-Preis, Registerstand und Verbrauch dürfen entsprechend den bestehenden Datenbankconstraints nicht negativ sein; das optionale `meterValue` kann vorzeichenbehaftet sein. `demoPricePerUnit` ist kein produktiver Abrechnungsvorgang. Einheiten müssen zur Zählereinheit passen; es erfolgt keine automatische Einheitenumrechnung beim CSV-Import.

## Dubletten und Übernahme

Die Prüfung erkennt explizite IDs, Seriennummern, externe Device-/Gateway-IDs und natürliche Schlüssel: Liegenschaft (Name, Adresse, Stadt), Gebäude (Liegenschaft, Name), Nutzungseinheit (Gebäude, Name). Natürliche Textschlüssel werden mit NFKC, Trim und deutscher Kleinschreibung normalisiert. Messwerte sind nach Mandant, Zähler, Zeitpunkt und Quelle eindeutig; Device und messageId sichern zusätzlich Idempotenz.

Es gibt kein Upsert und kein stilles Überschreiben. Eine bereits abgeschlossene Datei mit gleicher Feldzuordnung wird über ihren SHA-256-Fingerprint abgewiesen. Dubletten können als fehlerhafte Zeilen explizit übersprungen werden. Bei erneutem Upload nach einer teilweisen Übernahme greifen die Prüfungen gegen den inzwischen gespeicherten Bestand.

Bei Bestätigung werden Referenzen und Dubletten erneut geprüft, Lizenzlimits unter einer Mandantensperre geprüft und alle verbleibenden Zeilen samt AuditEvent in einer Transaktion geschrieben. Ein Fehler rollt die gesamte Übernahme zurück; die Vorschau bleibt zur Prüfung erhalten. Datenbankconstraints bleiben die letzte Integritätsgrenze.

## Historie, Sammelbearbeitung und Audit

Die Historie enthält Datei (ohne lokalen Pfad), Benutzer-ID und Namenssnapshot, Zeitpunkt in UTC, Datentyp, ursprüngliche Datensatzanzahl, erfolgreich importierte, aktuell fehlerhafte und ausdrücklich übersprungene Zeilen sowie Status. Je Seite werden 25 Importe über einen ID-Cursor geladen. Ersteller werden ohne Passwort- oder Sitzungsdaten abgebildet.

`PREVIEWED` bedeutet Vorschau, `COMPLETED` abgeschlossene Übernahme, `EXPIRED` abgelaufene Vorschau. „Fehlerhaft“ zählt betroffene Zeilen, nicht Meldungen; ein dateiweiter Fehler betrifft alle Zeilen. Gültige, noch nicht bestätigte Zeilen zählen nicht als erfolgreich. Nach Abschluss gilt erfolgreich + übersprungen = Datensatzanzahl. Ein abgelehnter Übernahmeversuch wird nicht fälschlich als erfolgreich markiert. Vor der Erweiterung fehlende Dateinamen werden als Altbestand gekennzeichnet.

`data_import.previewed`, `data_import.rows_skipped` und `data_import.completed` werden atomar mit der jeweiligen Änderung geschrieben. Das Überspringen speichert ausgewählte ursprüngliche Zeilennummern und eine Begründung mit 10–1.000 Zeichen im AuditEvent. Historie und Fingerprint bleiben erhalten; normalisierte Vorschauwerte werden nach erfolgreicher Übernahme gelöscht. Abgelaufene Vorschauen werden nicht mehr bei einem neuen Upload gelöscht. Eine zeitgesteuerte Bereinigung abgelaufener Vorschauinhalte ist noch nicht implementiert.

## CSV-Export

`GET /api/data-management/export` exportiert historische Messwerte. Erforderlich sind `from` und `to` als ISO-Zeitstempel mit Offset; der Zeitraum ist **[from, to)**. Optional: `meterId`, `propertyId`, `medium`; SUPER_ADMIN benötigt zusätzlich `tenantId`. Die Filter wirken gemeinsam. Beispiel:

```text
/api/data-management/export?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&medium=WATER
```

Die CSV enthält IDs, Seriennummer, Liegenschaft, Medium, UTC-Zeitstempel, Zählerstand, optionalen Messwert, Verbrauch, Einheit, Quelle, Qualität und Exportzeitraum. Sie verwendet UTF-8-BOM, Semikolon, CRLF und Dezimalpunkt. Formelauslösende Textzellen erhalten ein Apostroph; reine negative Dezimalzahlen bleiben numerisch unverändert. Geschützte Texte sind beim Reimport gegebenenfalls fachlich zu prüfen.

Jeder Aufruf authentifiziert selbst. Kunden bleiben an ihren Sitzungsmandanten gebunden. USER erhalten nur Daten aus explizit freigegebenen Liegenschaften; fehlende Freigaben ergeben ohne Objektfilter eine leere CSV, explizit nicht zugängliche IDs einen 404-Fehler. Jede Datenbankseite erzwingt die Freigabebedingung erneut.

Der Download streamt nach ID in Blöcken von 1.000 Datensätzen mit Backpressure und ohne vollständigen Browser-Blob. `receivedAt` begrenzt den Bestand auf den Exportstart. Es gibt keine stille Zeilenobergrenze. Leere Ergebnisse liefern die Kopfzeile, Datenbankfehler keinen Demo-Fallback. Ein Fehler nach Beginn der Übertragung bricht den Stream ab; eine unvollständige Datei muss erneut exportiert werden. Parallel ausgeführte Korrekturen werden nicht durch einen langlaufenden Datenbank-Snapshot eingefroren. Für revisionsfeste Stichtagsexporte ist künftig ein separater Snapshot-/Jobprozess erforderlich.

Die Exportoberfläche steht in Import- und Qualitätsverwaltung bereit; die API berücksichtigt auch lesende Rollen. Stammdatenexporte, Hintergrundjobs für Großimporte und ein allgemeiner Import-Fehlereditor sind nicht Bestandteil dieser Phase.

## Prüfen

`pnpm test` enthält CSV-Parser-/Exporttests. `pnpm test:integration` prüft Isolation, Sammelbearbeitung, Historienseiten, präzise Dezimalwerte und Streaming über mehrere Blöcke. `pnpm test:http` prüft die authentifizierten API-Routen einschließlich CSRF-Abweisung; dafür muss die lokale Anwendung laufen. Weitere fachliche Regeln: [DATA-QUALITY.md](DATA-QUALITY.md).
