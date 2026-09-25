# Regeln und Alarme

Eine Rule beschreibt einen validierten Trigger mit Bedingungen und Aktionen; ein Alarm ist das konkrete technische/fachliche Ereignis mit Status. Bedingungen können mit AND/OR kombiniert werden. Cooldown, Deduplication und geplante Prüfungen verhindern unnötige Wiederholungen, soweit der jeweilige Rule-Pfad dies unterstützt.

Beispiel: „Wenn Wasserverbrauch über Schwelle liegt UND Datenqualität gültig ist, erzeuge Alarm.“ Alarmstatus werden quittiert (`acknowledge`) oder erledigt (`resolve`); History und Audit bleiben nachvollziehbar. Regeln werden tenantgebunden serverseitig validiert und führen keinen freien Code aus.
