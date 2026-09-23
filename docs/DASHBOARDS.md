# Configurable Dashboards (Phase 5k)

Dashboards und Widgets geh�ren immer genau einem Tenant. PRIVATE ist nur f�r den Besitzer sichtbar, TENANT f�r den Tenant und ROLE_BASED f�r die konfigurierten Rollen. �ffentliche anonyme Links gibt es nicht.

## Widgets und Visualisierung

Unterst�tzte Widgettypen sind Verbrauch, Kosten, Peak, Grundlast, Vorperiodenvergleich, Lastprofil, Anomalien, Forecast, Benchmark, offene Alarme sowie Z�hler- und Gatewaystatus. Zeitreihen werden als Linien-/Vergleichsdaten, Perioden als Balkendaten und Kennzahlen als KPI-Karten dargestellt. Jede Chartdarstellung hat eine Tabellenalternative und sichtbare Lade-, Fehler- und Leerzust�nde.

## Layout

Widgets werden im 12-Spalten-Raster verschoben und mit Mindest-/Maximalgr��en ver�ndert. Position, Gr��e und Kollisionen werden serverseitig validiert; ung�ltige oder kollidierende Layouts werden abgewiesen. Die Speicherung erfolgt �ber die Dashboard-Widget-API und bleibt nach Reload erhalten.

## Filter und Templates

Widgetfilter k�nnen Zeitraum, Medium, Liegenschaft, Geb�ude, Z�hler und Aggregation enthalten. Templates erzeugen tenantgebundene private Dashboards f�r Energie, Strom, Wasser, Gas, W�rme, Betrieb und Management. Dashboard-Duplizierung erzeugt neue IDs und setzt den aktuellen Besitzer.

## Refresh und Export

Geeignete Widgets k�nnen Refreshintervalle 0, 30, 60, 300 oder 900 Sekunden speichern. Client-Refresh sollte bei verborgenem Tab pausieren und darf keine parallelen Requests starten. CSV-Export erfolgt serverseitig nach Berechtigungspr�fung; Druck nutzt die normale barrierearme Dashboardansicht.

## Performance und Sicherheit

Widgetdaten sollen gezielt und parallel begrenzt geladen werden. Layoutgrenzen sind maximal 12 Spalten Breite und 20 Rasterzeilen H�he; Diagramme sollen Datenpunkte begrenzen. Jede Dashboard-, Widget-, Meter- und Property-ID wird tenantgebunden gepr�ft. Es werden keine freien Queries oder JavaScript-Ausdr�cke gespeichert.
