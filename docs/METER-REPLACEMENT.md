# Zählerwechsel

Ein Wechsel verbindet alten und neuen physischen Zähler über `MeterReplacement`. Gespeichert werden Ausbauzeitpunkt/-stand, Einbauzeitpunkt/-stand, Grund, Dokumentation und der Benutzer. Beide Zähler müssen demselben Mandanten, Medium und Einheit angehören. Der alte Zähler wird auf `MAINTENANCE` gesetzt; Readings bleiben unverändert.

Der Server sperrt den Tenant während des Wechsels, prüft Zugriff über PropertyGrant und schreibt die Mutation mit AuditEvent atomar. Die Verbrauchsauswertung kann die beiden Zeitreihen über die Replacement-Kette verbinden; ein Installationsstand dient dabei als neue Basis und wird nicht als Verbrauchsdifferenz gezählt. Vor Hardwarebetrieb sind Zählernummern, Stände und Dokumente vor Ort zu bestätigen.

Die Kostenberechnung grenzt Messintervalle über `validFrom`/`validTo` zeitproportional an Tarifgrenzen ab. Ein Intervall, das eine Grenze überquert, wird nach Zeitanteilen auf die beiden gültigen Tarife verteilt; ein Stand an der Grenze bleibt dem neuen Tarif zugeordnet. Preise, Gasfaktoren und frühere Abrechnungszeiträume werden nicht überschrieben.
