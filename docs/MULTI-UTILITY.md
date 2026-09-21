# Phase 5A: Multi-Utility

## Gemeinsames Modell

`MeterType` bleibt aus Kompatibilitätsgründen der persistierte Utility-Typ:
ELECTRICITY, WATER, GAS, HEAT. `UtilityType` ist sein fachlicher TypeScript-Typ.
Keine vier getrennten Ingestion-Systeme: Device/Gateway, Reading, Freigaben,
AuditEvent und die Phase-4b-TechnicalAlert-Deduplizierung bleiben erhalten.
`Measurement` ergänzt Reading mit Messgröße, Rohwert/Roheinheit,
normalisiertem Decimal-Wert/Einheit und Qualität. Zusammengesetzte
Reading-/Tenant-Fremdschlüssel sichern die Zuordnung. Eine versionierte
Migration übernimmt alte Reading-Zählerstände als Primärmessgröße. Bei diesen
Altbeständen ist der Rohwert der bislang gespeicherte Wert, kein rekonstruierter
Geräteregisterwert. Vorhandene Modbus-TechnicalMeasurement-Diagnosen bleiben erhalten.

Die Profilregistrierung in `src/lib/utility.ts` steuert Validierung und Anzeige.
COOLING, STEAM, TEMPERATURE und PRESSURE sind noch keine freigeschalteten Medien.
Ihre spätere Ergänzung benötigt eine Enum-Migration und ein validiertes Profil.

| Medium | Messgrößen                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strom  | ENERGY_IMPORT, ENERGY_EXPORT, ENERGY_NET, ACTIVE_POWER, ACTIVE_POWER_L1/L2/L3, REACTIVE_POWER, VOLTAGE_L1/L2/L3, CURRENT_L1/L2/L3, FREQUENCY, POWER_FACTOR |
| Wasser | VOLUME_TOTAL, CONSUMPTION, FLOW_RATE, TEMPERATURE                                                                                                          |
| Gas    | VOLUME_TOTAL, CONSUMPTION, ENERGY_EQUIVALENT, FLOW_RATE                                                                                                    |
| Wärme  | ENERGY_TOTAL, VOLUME_TOTAL, POWER, FLOW_RATE, SUPPLY_TEMPERATURE, RETURN_TEMPERATURE, DELTA_T                                                              |

Nicht gelieferte Zusatzmessgrößen erscheinen als „Nicht verfügbar“.
Ein REST-Messpaket benötigt den primären Zählerstand (Importenergie,
Volumen bzw. Wärmeenergie). Die REST-Route akzeptiert weiterhin den bisherigen
einzelnen Reading-Vertrag. Das neue Paket enthält `messageId`, einen UTC-/Offset-
Zeitstempel und `measurements: [{metric,value,unit,quality}]`; Dezimalwerte werden
als Zeichenfolgen übertragen. IDs für Mandant und Zähler sind nicht erlaubt:
Diese bestimmt das separate Device-Credential. Der neue Vertrag ist über die
bestehende REST-Route `/api/v1/ingest/readings` verfügbar. Signierte MQTT-
Gateway-Verträge bleiben kompatibel; bestehende Modbus-Werte werden ebenfalls
in das gemeinsame Modell übernommen.

## Einheiten und Auswertung

Energie normalisiert auf kWh (Wh × 0,001; MWh × 1000), Leistung auf kW
(W × 0,001; MW × 1000), Volumen auf m3 (l × 0,001), Durchfluss auf m3/h
(l/min × 0,06). `m³` und `m³/h` sind zulässige Schreibweisen.
V, A, Hz, kvar und dimensionsloser Leistungsfaktor bleiben getrennt.
Absolute Temperaturen normalisieren auf °C (K − 273,15), Temperaturdifferenzen
auf K ohne Offset. Nicht passende Dimensionen werden abgewiesen.

Reading-Verbrauch entsteht aus zwei aufeinanderfolgenden gültigen Zählerständen.
Der erste Stand ist eine Basis, kein Verbrauch. Rückläufige/historische Werte
erzeugen SUSPECT und keinen künstlichen Verbrauch. INVALID und SUSPECT werden
aus neuen Berichten ausgeschlossen. Rohwerte bleiben erhalten.
Alle Berichte verwenden sichtbar UTC und halboffene Zeiträume. Heute, gestern,
laufender Monat, vollständiger Vormonat/Vorjahresmonat sowie laufendes Jahr und
vollständiges Vorjahr werden getrennt ausgewiesen. Ein laufender Zeitraum ist
nicht unmittelbar mit einem vollständigen Vergleichszeitraum gleichzusetzen.
Verbrauch wird dem Zeitpunkt des Endstands zugeordnet; keine erfundene
Interpolation bei Lücken. Diagramme können zur Darstellung Zahlen verwenden;
Normalisierung, Verbrauchsdifferenzen und Kosten verwenden Decimal.

## Tarife

Tarife gelten pro Mandant/Medium oder vorrangig pro Zähler. Unterstützt werden
EUR/kWh (Strom), EUR/m3 (Wasser), EUR/m3 oder EUR/kWh (Gas) und EUR/kWh oder
EUR/MWh (Wärme). Der optionale Grundpreis ist EUR/Tag, zeitanteilig berechnet.
Gültigkeitszeiträume dürfen sich innerhalb desselben Geltungsbereichs nicht
überschneiden. Zukünftige Wechsel beenden einen offenen Vorgänger atomar und
auditiert. Historische Tarife lassen sich nicht überschreiben; rückwirkende
Wechsel werden zurückgewiesen. Die erste Tarifzuordnung darf historisch beginnen.
Tarifdeckungslücken werden angezeigt und nicht durch Demo-Preise ersetzt.

Gasenergie: m3 × Zustandszahl × Brennwert (kWh/m3). Für einen Gas-kWh-Tarif
sind beide positiven Faktoren explizit erforderlich und Teil des historischen
Tarifs. Es gibt keine Netzbetreiber-Standardwerte; originale m3 bleiben erhalten.
Dies ist eine Kostenorientierung, kein freigegebenes Abrechnungssystem.
Ein Intervall, das einen Tarifwechsel überspannt, verwendet den Tarif am
Endstand; für eine exakte Abgrenzung ist ein Messwert an der Tarifgrenze nötig.

Administratoren konfigurieren Alarmschwellen und Tarife auf der Zählerdetailseite.
Die APIs `/api/meters/:id/utility` und `/api/utility/tariffs` authentifizieren
jeden Einstieg, prüfen Rolle/Mandant/Freigaben, validieren mit Zod und schreiben
Mutationen mit AuditEvent atomar. USER erhält ausschließlich freigegebene
Liegenschaften, auch für Details, Aggregate und CSV.

## Alarme

OFFLINE, HIGH_CONSUMPTION, CONTINUOUS_CONSUMPTION, LEAK_SUSPECTED,
INVALID_READING, REVERSE_FLOW, TEMPERATURE_ANOMALY und QUALITY_WARNING nutzen
die vorhandene TechnicalAlert-Tabelle mit Tenant/Typ/Objekt-Deduplizierung und
Erholung. Kommunikationsstörungen bleiben Teil der vorhandenen Phase-4b-
Geräte-/Gateway-Überwachung; COMMUNICATION_ERROR ist als fachliche Kategorie
vorbereitet, ohne zusätzlichen Geräteadapter.

Standardmäßig ist kein pauschaler hoher Verbrauch vorgegeben. Wasser-
Dauerverbrauch benötigt eine belegte Historie von sechs Stunden und Durchfluss
über 0,01 m3/h, mit maximal 30 Minuten zwischen Werten. Ohne ausreichende
Historie gibt es keinen Leckageverdacht. Wärmeschwellen: Rücklauf über Vorlauf
plus 5 K, Delta-T über 60 K, inkonsistente Temperaturdifferenz, Leistung ohne
Durchfluss oder Durchfluss bei Nullleistung. Offline-Vorgabe: 60 Minuten.
Schwellen sind konfigurierbar; technische Meldungen sind Hinweise zur Prüfung.
Offline-Persistenz verwendet den laufenden vorhandenen Monitor; die Übersicht
zeigt den Zeitablauf zusätzlich unmittelbar anhand des letzten Kontakts.

## Demo und Export

```powershell
pnpm db:generate
pnpm db:migrate
# Nur lokale Entwicklungsdatenbank, SEED_DEMO=true, niemals Produktion:
pnpm db:seed:utility
pnpm test:utility
```

Der eigene Mandant `demo-multi-utility` enthält eine Demo-Liegenschaft mit
je einem Strom-, Wasser-, Gas- und Wärmezähler. Als SUPER_ADMIN diesen Mandanten
auswählen. Das erste Seed erzeugt 24 Stunden Viertelstundenwerte über die
authentifizierte Ingestion, keine direkten Reading-Inserts. Bestehende Daten und
Passwörter werden nicht überschrieben. Temporäre Device-Tokens bleiben nur im
Prozess und werden anschließend widerrufen. Wiederholungen ergänzen aktuelle
Werte. Demo-Tarife sind ausdrücklich fiktiv (0,32 EUR/kWh Strom, 2,10 EUR/m3
Wasser, 1,20 EUR/m3 Gas, 0,10 EUR/kWh Wärme; kein Grundpreis).

VirtualElectricityMeter, VirtualWaterMeter, VirtualGasMeter und VirtualHeatMeter
verwenden dasselbe Paketformat. Wasser hat Morgen-/Abendspitzen und nachts
Nullverbrauch; `--leak` ergänzt einen konstanten Durchfluss. Gas simuliert eine
saisonale Heizlast plus Grundlast ohne echte Wetterdaten. Wärme koppelt Leistung,
Durchfluss, Vor-/Rücklauf und Energie (simulierter Wasser-Wärmeträger).
`pnpm virtual-meter` sendet fortlaufend über HTTP; Medium und Device-Token werden
über die vorhandenen Umgebungsvariablen ausgewählt, `--once` sendet einmal.
`--create` verwendet ein neu angelegtes Credential nur im Prozessspeicher und
schreibt es nicht ins Log. Für spätere Starts ein separat autorisiert erzeugtes
Device-Credential über `VIRTUAL_DEVICE_TOKEN` bereitstellen.

Der CSV-Link auf der Detailseite exportiert Medium, Zähler, Messgröße, Zeitraum,
Rohwert/Roheinheit, normalisierten Wert/Einheit, Qualität und UTC-Zeitstempel.
Maximal 31 Tage und 10.000 Zeilen; Formeln werden entschärft. Der bestehende
Modbus-CSV-Vertrag bleibt unverändert. CSV-Import ist nicht freigegeben.

## Vor Hardware

Keine neue reale Verbindung, kein herstellerspezifisches M-Bus/wM-Bus-Protokoll.
Noch nötig: konkrete Geräteprofile/Handbuchprüfung, physische Register-/RS485-
Abnahme, Zählerwechsel-/Resetstrategie, Messlücken und Tarifgrenz-Ablesung,
Abrechnungsregeln/Rundung, Lasttests und Langzeitbetrieb, Browser-/Zielgeräte-
Abnahme sowie die bereits dokumentierten TLS-/Betriebsanforderungen.
Die Demo enthält einen Tag Historie, daher sind Monats-/Vorjahresvergleiche
teilweise null und stellen keine vollständige Vergleichsdatenbasis dar.

## Prüfstand 21.09.2026

- Prisma-Generierung und versionierte Migrationen auf der lokalen Demo-Datenbank erfolgreich.
- Typecheck, ESLint, Prettier-Formatcheck und Produktionsbuild erfolgreich.
- 64 Unit-Tests erfolgreich, einschließlich zwölf neuer Utility-Tests und vorhandener Phase-3-/4a-/4b-Unit-Tests.
- Acht zusätzliche Utility-Datenbanktests erfolgreich (zusammen mit Unit-Tests: 72).
- Bestehende Integration: 18 Checks; Gateway-Sicherheit: 16 Checks; Pilotintegration: 45 Checks erfolgreich.
- Sieben HTTP-Checks für Dashboard, vier Detailprofile, Anmeldung und explizite Mandantenauswahl erfolgreich (`pnpm test:utility:http` mit laufendem Webserver).
- Vollständige MQTT-/Modbus-Transport-E2E- und mTLS-Brokertests nicht erneut ausführbar: lokaler Docker-Dienst/Broker nicht verfügbar. Keine physische Hardware- oder visuelle Browserabnahme behauptet.
