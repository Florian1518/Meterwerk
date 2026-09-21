# Kunden-Onboarding

Der geschützte Bereich `/onboarding` führt Tenant-Administratoren und SUPER_ADMIN durch die Einrichtung: Mandant, Admin-Einladung, Liegenschaft, Gebäude, Nutzungseinheiten, Gateway, Zähler, Tarif und weitere Benutzer. Der Status wird mandantengebunden aus der Datenbank abgeleitet; die API akzeptiert keine fremde Tenant-ID für Kundenrollen. Der Go-Live-Endpunkt verlangt alle Schritte und schreibt ein AuditEvent. Die eigentliche Hardware-Inbetriebnahme bleibt ein separater, protokollabhängiger Prozess und wird hier nicht automatisch ausgeführt.
