# Datenqualität

Meterwerk prüft historische Messreihen tenantgebunden und speichert Befunde als nachvollziehbare Datenqualitätsmeldungen. TENANT_ADMIN und SUPER_ADMIN können im Bereich **Datenqualität** einen Zeitraum und Zähler auswählen, eine Prüfung starten und nach Status oder Problemtyp filtern. SUPER_ADMIN muss dabei einen Tenant explizit auswählen.

## Erkennung

Die Prüfung erkennt fehlende Messwerte aktiver Zähler, gleiche Messzeitpunkte, Zeitstempel vor der Installation oder mehr als fünf Minuten in der Zukunft, für nicht-elektrische Medien negative Verbräuche, ungewöhnliche Sprünge gegenüber dem Median, rückläufige Registerstände, abweichende Einheiten, Devices mit falscher Zählerzuordnung und Datenlücken. Befunde erhalten `OK`, `WARNING` oder `ERROR`; einzelne Findings sind `WARNING` oder `ERROR`, während Zähler ohne offenen Befund als `OK` dargestellt werden. Die Schwellen für Sprünge und Lücken sind heuristisch und sollten fachlich je Messprofil kalibriert werden.

Scans speichern den geprüften Zeitraum in UTC. Datumsfilter ohne Uhrzeit werden als UTC-Kalendertage interpretiert; die Anzeige kennzeichnet den verwendeten Zeitraum als UTC. Die Erkennung liest maximal 5.000 Zähler und 100.000 Messwerte je Scan. Größere Mandanten sollen in kleinere Zeitfenster oder Zählergruppen aufteilen.

## Korrekturen

Korrekturen sind ausschließlich serverseitig autorisiert, tenantgebunden und benötigen eine Begründung von mindestens zehn Zeichen. Unterstützt werden gezielte Korrektur, Ersatzwert und Markierung als ungültig. Ein ungültiger Messwert bleibt zur Historienwahrung gespeichert und erhält `INVALID`; Datensätze werden nicht physisch gelöscht. Jede Änderung speichert den vollständigen vorherigen und nachfolgenden Messwert einschließlich Messwert-Unterdatensätzen in `DataQualityCorrection` und legt im selben Datenbankvorgang ein AuditEvent an. Korrekturen prüfen Zeitraum, Einheit, nichtnegative Registerstände, fachlich unzulässige negative Verbräuche und doppelte Zeit-/Quellenkombinationen.

## Endpunkte

- `POST /api/data-quality/scan` startet für den authentifizierten Tenant einen Scan; SUPER_ADMIN übergibt den explizit gewählten `tenantId`.
- `POST /api/data-quality/readings/{id}/correction` führt eine begründete Korrektur aus.
- `GET /api/data-quality/readings/{id}/history?tenantId=...` liefert die Korrekturhistorie ohne Messwerte anderer Tenants.

Die Prisma-Migration `202609240002_data_quality` muss vor dem Einsatz angewendet werden. Korrekturhistorie ist durch einen restriktiven Fremdschlüssel gegen versehentliches Löschen des zugehörigen Messwerts geschützt.
