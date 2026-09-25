# Zählerwechsel

Ein Wechsel verbindet alten und neuen physischen Zähler über `MeterReplacement`. Gespeichert werden Ausbauzeitpunkt/-stand, Einbauzeitpunkt/-stand, Grund, Dokumentation und der Benutzer. Beide Zähler müssen demselben Mandanten, Medium und derselben Einheit angehören. Der alte Zähler wird auf `MAINTENANCE` gesetzt; Readings bleiben unverändert.

Im vorhandenen Wechselablauf den alten Meter wählen, Endstand und Ausbauzeitpunkt erfassen, neuen Meter mit Startstand und Einbauzeitpunkt zuordnen, Grund/Dokumentation ergänzen und validieren. Der Server sperrt den Tenant während der Mutation, prüft Zugriff über PropertyGrant und schreibt atomar mit AuditEvent. Historische Readings des alten Meters bleiben erhalten; Auswertungen können die Replacement-Kette berücksichtigen und den Einbaustand als neue Basis verwenden.

Beide Zähler müssen fachlich zusammenpassen. Vor Abschluss Identitäten, Medium, Einheit, Stände, Zeitpunkte und Zuordnung prüfen. Reale Zählernummern und Stände müssen vor Ort bestätigt werden; dieses Handbuch ersetzt keine Installations- oder Abnahmefreigabe. Details zur Software-Inbetriebnahme: [Commissioning](COMMISSIONING.md) und [Field Service](FIELD-SERVICE.md).

Die Kostenberechnung grenzt Messintervalle über `validFrom`/`validTo` zeitproportional an Tarifgrenzen ab. Ein Intervall, das eine Grenze überquert, wird nach Zeitanteilen auf die gültigen Tarife verteilt; ein Stand an der Grenze bleibt dem neuen Tarif zugeordnet. Preise, Gasfaktoren und frühere Abrechnungszeiträume werden nicht überschrieben.
