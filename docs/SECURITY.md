# Meterwerk Security

## Authentication und Sessions

Passwörter werden mit Argon2id und zufälligem Salt gehasht. Session-IDs sind
zufällige 32-Byte-Tokens, werden nur als HMAC-Digest gespeichert und liegen in
HttpOnly-, SameSite-Lax-Cookies. In Produktion sind Cookies Secure; Sessions
laufen nach acht Stunden ab, werden beim Login rotiert und beim Logout bzw.
Passwortwechsel widerrufen. Session-Tokens werden nicht in URLs oder Logs
ausgegeben. `SESSION_SECRET` ist in Produktion zwingend erforderlich.

MFA/TOTP und Recovery-Codes bleiben aktiv. Reset-Tokens werden nur gehasht,
laufen nach 30 Minuten ab und sind nach einmaliger Nutzung ungültig.
Login- und Reset-Anfragen sind serverseitig rate-limitiert; unbekannte
E-Mail-Adressen erhalten dieselbe Reset-Antwort wie bekannte Konten.

## Authorization und Tenant-Isolation

Jeder Serverpfad authentifiziert sich selbst. `tenantId` stammt für Kunden aus
der Sitzung; SUPER_ADMIN muss einen Mandanten explizit auswählen. Prisma-
Abfragen verwenden Tenant- und, für USER, Property-Grant-Sichten. Objekt-IDs,
Child-Objekte, Exporte, Reports, Dashboards, Attachments, Devices, Gateways,
WorkOrders, Supportfälle, Webhooks, Rules und API-Keys werden serverseitig
geprüft. UI-Sichtbarkeit ist kein Sicherheitsmechanismus.

## IDOR, CSRF und Injection

Objektzugriffe prüfen Tenant, Rolle, Property Grant und Parent-Beziehung.
State-changing JSON-Endpunkte verwenden `assertOrigin`/`readBody`; Cookies
werden mit SameSite geschützt. API-Key-Endpunkte sind von Browser-Cookies
getrennt und verwenden ausschließlich den API-Key-Scope.

React escaped benutzerkontrollierte Texte. Es gibt keine absichtliche
`dangerouslySetInnerHTML`-Ausgabe. Prisma-Template-Queries sind parametrisiert;
dynamische Sortier- und Filterfelder sind whitelisted. Uploads prüfen MIME,
Größe und Inhalt. Storage-Keys lehnen absolute Pfade, `..` und NUL-Bytes ab;
Shell-Kommandos werden nicht aus Benutzereingaben erzeugt.

## Header und CORS

Die Proxy-Schicht setzt CSP mit Nonce/strict-dynamic, `frame-ancestors 'none'`,
`X-Content-Type-Options`, Referrer- und Permissions-Policy, X-Frame-Options
und in Produktion HSTS. Authentifizierte APIs senden kein pauschales
`Access-Control-Allow-Origin: *`; nicht freigegebene Cross-Origin-Anfragen
bleiben blockiert. Public API-Zugriff erfolgt über tenantgebundene API-Keys.

## Secrets, Fehler und Audit

DB-, MQTT-, SMTP-, Webhook-, Storage-, Push- und Signing-Secrets liegen nur in
Deployment-Secrets. Sie dürfen weder im Repository, Client-Bundle, Build-
Artefakt, Log noch in Fehlermeldungen erscheinen. API-Fehler geben keine
Stacktraces zurück und enthalten Correlation-IDs.

Privilegierte Änderungen, sensible Downloads, API-Key-/Credential-Aktionen,
Rollenänderungen, Exporte, Support-Aktionen und Maintenance Mode erzeugen
AuditEvents. Auditdaten sind tenantgebunden und dürfen nicht über reguläre
Kundenpfade gelöscht oder verändert werden.

## Tests und Restrisiken

Unit- und statische Security-Tests prüfen Rate-Limits, Header, Storage-Keys,
Tenant-Schlüssel und Escaping. DB-Integrationstests für Cross-Tenant-IDOR,
Property Grants, MFA, Session-Widerruf und parallele Zugriffspfade laufen nur
mit erreichbarem PostgreSQL. Offene Risiken werden nicht als behoben markiert;
insbesondere fehlen ohne Testdatenbank empirische HTTP-/DB-Security-Nachweise.
