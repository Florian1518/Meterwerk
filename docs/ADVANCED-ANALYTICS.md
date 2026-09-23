
## Phase 5j Teil 3

### Anomalien

Anomalien werden regelbasiert aus Peaks, Grundlast, Nachtverbrauch, historischen Abweichungen, konstanten Folgen und fehlenden Daten abgeleitet. Ergebnisse können als AnalyticsAnomaly tenantgebunden persistiert werden. Der Fingerprint aus Zähler, Typ und Zeitraum dedupliziert Wiederholungen. Status sind OPEN, ACKNOWLEDGED, RESOLVED und DISMISSED; Statusänderungen mit Kommentar werden als AuditEvent protokolliert.

### Forecast

Die Prognose verwendet gleitende historische Mittelwerte und einen linearen Trend. Unterstützt werden Tag, Woche und Monat. Unter sieben Datenpunkten wird insufficient_data ausgegeben. Confidence ist low, medium oder high und beschreibt nur die Datenbasis, keine statistische Garantie. Ist-Werte und Prognosen werden getrennt zurückgegeben.

### Kosten und Skalierung

Kosten verwenden Decimal und zeitlich gültige Tarife. Rohmesswerte bleiben Source of Truth. Für größere Datenmengen kann die Analytics-Abfrage später durch tenantgebundene Tages-/Stunden-Buckets ergänzt werden; diese müssen aus Rohdaten reproduzierbar neu aufgebaut werden. Refresh erfolgt nach Ingestion oder periodisch per Worker, Invalidierung bei Korrekturen.

Das Dashboard steht unter /analytics bereit und bietet Zeitraumfilter, Kennzahlen, Lastprofil als zugängliche Tabelle und Anomalieliste. Forecast, persistierte Anomalien und Benchmarks sind über /api/analytics/forecast und /api/analytics/insights erreichbar.
