# Sicherheitsmodell

Tenant- und PropertyGrant-Prüfungen bleiben serverseitig die Autoritätsgrenze. Subdomains, Correlation-IDs und Header dienen nur Routing/Diagnose. Jede API authentifiziert sich selbst; Cookies werden in Pilot/Production Secure, HttpOnly und SameSite gesetzt.

PostgreSQL erhält eine separate TLS-/Pool-Konfiguration über `DATABASE_URL`. RLS ist als zusätzliche Defense-in-Depth vorbereitet (`docs/rls.sql`), ersetzt aber keine Anwendungsprüfung. Der RLS-Kontext muss pro Transaktion aus der authentifizierten Sitzung gesetzt werden.

Fehler- und Metrikdaten enthalten nur Fehlerklasse, Dienst, Request-ID und zulässige technische IDs. Tokens, Passwörter, Secrets und vollständige Payloads werden nicht erfasst. Attachments liegen außerhalb des öffentlichen Webroots, verwenden zufällige Schlüssel und werden bei jedem Download erneut tenant- und objektgeprüft.

CSRF-Schutz für JSON-Mutationen erfolgt über den bestehenden Origin-Vertrag in `readBody`; Form-Uploads müssen denselben Origin prüfen. CSV-Ausgaben verwenden die bestehende Formel-Entschärfung. Pfade werden nie aus Benutzereingaben gebildet. SQL-Zugriffe laufen über Prisma oder parametrisierte Queries.
