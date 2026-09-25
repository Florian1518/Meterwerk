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

## Phase 5r Teil 2: Uploads und Malware-Scanning

Anhänge, Fotos, PDFs und CSV-Importe werden serverseitig auf Größenlimit,
erlaubten MIME-Typ, Endung, Magic Bytes, UTF-8 und sichere Dateinamen geprüft.
Storage-Schlüssel sind zufällige, tenantgebundene IDs; Originalnamen werden nur
als Metadaten verwendet. Absolute Pfade, Traversal, NUL-/Steuerzeichen,
Double-Extensions, SVG/HTML und ausführbare Inhalte werden abgewiesen.

`Attachment.scanStatus` kennt `PENDING`, `CLEAN`, `INFECTED`, `FAILED` und
`SKIPPED`. Die ClamAV-kompatible INSTREAM-Abstraktion ist vorbereitet. Ohne
konfigurierten Scanner wird nicht gelogen: der Status ist `SKIPPED` und der
Download bleibt quarantänisiert. Nur `CLEAN` wird ausgeliefert; Hash,
Dateityp und Storage-Pfad werden beim Download erneut geprüft. INFECTED,
abgewiesene Uploads und Rescans erzeugen AuditEvents. Scanner und Storage
werden nie mit Upload-Dateinamen oder Upload-Code ausgeführt.

## Storage und Downloads

Lokale Dateien liegen in privaten Verzeichnissen mit restriktiven Rechten und
Symlink-/Datei-Checks. S3-kompatible Objekte werden mit tenantgebundenen Keys,
privater ACL und serverseitigem Bearer-Token angesprochen. Der gespeicherte
Provider wird beim Lesen verwendet. Downloads prüfen Authentifizierung,
Tenant, Parent-Objekt, PropertyGrant, Scanstatus und Hash; kurzlebige Tokens
sind an Tenant, Benutzer und Attachment gebunden. Antworten setzen `nosniff`,
eine Sandbox-CSP, `no-store` und eine bereinigte Content-Disposition.

## SSRF und Webhooks

Ausgehende Ziele akzeptieren in Produktion nur HTTPS. Localhost, Loopback,
private/link-local/Metadata-/interne Netze, Benutzerpasswörter, Fragmente,
`file:` und `ftp:` werden blockiert. DNS wird vor dem Request vollständig
geprüft und an die Verbindung gepinnt; Redirects sind verboten, Timeouts und
Antwortgrößen begrenzt. Die Abstraktion gilt für Webhooks und S3-Endpunkte.

Webhooks werden verschlüsselt gespeichert, nur einmal vollständig angezeigt
und über einen Tenant-Admin rotierbar. HMAC bindet Body, Delivery-ID und
Timestamp; das Replay-Fenster beträgt fünf Minuten. Zustellungen nutzen
Lease/Retry/Dead-Letter, eindeutige `(webhookId,eventId)`-Schlüssel und
keine Geheimnisse in Fehlern oder Logs.

## Public API und Replay-Schutz

API-Keys werden ausschließlich als SHA-256-Hash gespeichert, einmalig gezeigt,
tenantgebunden, scopebegrenzt, ablauf- und widerrufbar und rotierbar.
Bearer-Header ist der einzige Credential-Kanal; Query-Parameter werden nicht
akzeptiert. Limits gelten pro Key und Tenant, Seiten-/Zeitfenster sind begrenzt,
fremde Tenant-IDs und Scope-Eskalation werden abgewiesen. Login, MFA, Reset-
und Einladungspfade verwenden generische Antworten und atomare Verbrauchs-
Updates für Replay-Schutz. Webhook-, Ingestion- und Support-Request-IDs sind
idempotent bzw. durch Unique Constraints abgesichert.

## CSV-, PDF- und Report-Sicherheit

CSV-Zellen mit `=`, `+`, `-`, `@`, BOM oder Steuerzeichen erhalten ein
führendes Apostroph; echte negative Dezimalwerte bleiben unverändert. PDFs
werden aus bereits autorisierten Daten erzeugt. Text wird als PDF-Operand
escaped; HTML, Templates, externe URLs und lokale Dateien werden nicht
interpretiert. USER-Berichte werden vor Export erneut auf zugängliche Meter
geprüft.

## Supply Chain, CI und Secrets

`pnpm-lock.yaml` und `packageManager` sind festgelegt, Installationsskripte
werden im Audit nicht ausgeführt und CI verwendet `--frozen-lockfile`. Actions
sind auf Commit-IDs gepinnt, Checkout behält keine Credentials, Workflows
haben minimale Read-Rechte und Pull Requests erhalten keine Deploy-Secrets.
Der Secret-Scan prüft getrackte und nicht ignorierte Arbeitsdateien, gibt nur
Fundstelle/Regel aus und unterscheidet bekannte Test-Fixtures. Der transitive
`deepmerge-ts`-Fund wurde nach einer Kompatibilitätsprüfung per Override auf
die gepatchte 8.0.2-Version aktualisiert; Prisma validate/generate, Typecheck,
Security-Suite und Produktionsbuild bestanden danach. `mysql2` wurde sicher
auf die gepatchte 3.23.1-Minorversion aufgelöst.

## Security Events und Datenschutz

AuditEvents decken fehlgeschlagene Login-/MFA-Versuche, API-Key-Rate-Limits,
Cross-Tenant-Ablehnungen, Upload-Ablehnungen, Malware, Credential-Rotation,
Webhook-Signatur-/Zustellfehler und Support-Aktionen ab. Es gibt keine
unkontrollierte automatische Kontosperre. Diagnostic Bundles enthalten nur
notwendige Zähler und Audit-Aktionsmetadaten; Secret-Ciphertext, E-Mail-
Adressen, interne Fehlertexte und unnötige Kundennotizen werden nicht exportiert.
IP-, Standort- und Objektdaten bleiben auf die fachlich erforderlichen
Antworten beschränkt.

Die ClamAV-Anbindung, zentrale verteilte Rate-Limits und ein produktiver
Secret-Scanning-Job sind vorbereitet; der lokale Fallback bleibt nur für
Entwicklung zulässig. Vor Produktion müssen Scanner,
Retention/Deletion-Job, rotierte Secrets und ein externer Malware-/Dependency-
Prozess konfiguriert und gegen die reale Deployment-Umgebung geprüft werden.
