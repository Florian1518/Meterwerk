## Phase 5j Teil 3

### Anomalien

Anomalien werden regelbasiert aus Peaks, Grundlast, Nachtverbrauch, historischen Abweichungen, konstanten Folgen und fehlenden Daten abgeleitet. Ergebnisse k�nnen als AnalyticsAnomaly tenantgebunden persistiert werden. Der Fingerprint aus Z�hler, Typ und Zeitraum dedupliziert Wiederholungen. Status sind OPEN, ACKNOWLEDGED, RESOLVED und DISMISSED; Status�nderungen mit Kommentar werden als AuditEvent protokolliert.

### Forecast

Die Prognose verwendet gleitende historische Mittelwerte und einen linearen Trend. Unterst�tzt werden Tag, Woche und Monat. Unter sieben Datenpunkten wird insufficient_data ausgegeben. Confidence ist low, medium oder high und beschreibt nur die Datenbasis, keine statistische Garantie. Ist-Werte und Prognosen werden getrennt zur�ckgegeben.

### Kosten und Skalierung

Kosten verwenden Decimal und zeitlich g�ltige Tarife. Rohmesswerte bleiben Source of Truth. F�r gr��ere Datenmengen kann die Analytics-Abfrage sp�ter durch tenantgebundene Tages-/Stunden-Buckets erg�nzt werden; diese m�ssen aus Rohdaten reproduzierbar neu aufgebaut werden. Refresh erfolgt nach Ingestion oder periodisch per Worker, Invalidierung bei Korrekturen.

Das Dashboard steht unter /analytics bereit und bietet Zeitraumfilter, Kennzahlen, Lastprofil als zug�ngliche Tabelle und Anomalieliste. Forecast, persistierte Anomalien und Benchmarks sind �ber /api/analytics/forecast und /api/analytics/insights erreichbar.
