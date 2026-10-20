# Phase 1C-B – Abschlussbericht

Prüfdatum: 20. Oktober 2026. Basis: Branch `phase/gateway-provisioning`,
HEAD `c7652b7982bda6cd21284f99c8f0c58e1bc6a65f`.
HEAD und sauberer Working Tree wurden vor Beginn geprüft.
Keine Commits, Pushes, Deployments oder Staging-Mutationen.

## A. Geänderte Dateien

Die vollständige Liste steht unter P. Bestehende Phase-1C-A-Dienste wurden
erweitert; neu sind die zentrale Readiness, der bestätigungspflichtige
Provisioning-Dispatcher, zwei API-Routen und die interaktive Workflow-Komponente.
README und ARCHITECTURE dokumentieren die tatsächlichen Verhaltensänderungen.
Prisma-Schema und Migrationen bleiben unverändert.

## B. API-Routen

| Route                                                     | Vertrag                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/platform/gateways/properties?tenantId=…`        | SUPER_ADMIN; nur Properties des expliziten Kunden                                   |
| `GET /api/platform/gateways/[id]/provisioning?tenantId=…` | SUPER_ADMIN; Readiness, sichere Blocker und Schritte                                |
| `POST /api/platform/gateways/[id]/provisioning`           | SUPER_ADMIN; `tenantId`, `confirmed: true`, `operation`, strikt validiertes `data`  |
| `POST /api/gateways?tenantId=…`                           | Bestehender Vertrag jetzt mit obligatorischer Property, auch ohne `platformAdmin=1` |
| Bestehende Plattform-Listen-/Detail-GETs                  | Direkte Property, Lifecycle, Kontaktzeiten und öffentliche Nachweise                |

POST-Operationen: `LIFECYCLE`, `PROPERTY`, `INSTALLATION`, `PUBLIC_KEY`,
`COMMUNICATION_REGISTER`, `COMMUNICATION_CONFIRM`, `REVOKE_SIGNATURE`.
Origin-, Bodygrößen-, Rollen- und Tenantprüfung sowie no-store-Antworten.
Keine Private-Key-Ausgabe aus der neuen Provisioning-Route.

## C. UI-Erweiterungen

- Kundenabhängige Property-Auswahl mit Lade-, Fehler- und Leerzustand.
- Anlage mit Name, externer ID, Hersteller und Modell; NEW ohne installedAt.
- Direkte Property auf Liste und Detail; Legacy-NULL ausdrücklich
  „Keine Liegenschaft zugeordnet“.
- Lifecycle getrennt von technischem Status und Online/Offline,
  Erst-/Letztkontakt, Provisionierungsbeginn, Fehler und Aktivierungszeit.
- Konkrete erfüllte/offene/blockierte Schritte und deutsche Blocker,
  kein Prozentwert; serverseitig angebotene Transitionen mit Bestätigung.
- Signaturregistrierung, öffentliche Kommunikationsmetadaten und getrennte
  externe Freischaltungs-/Widerrufsbestätigungen.
- Stilllegung mit getrennten Anwendungs-, Signatur- und Brokerzuständen.

## D. Public-Key-Prozess

Der Ed25519 Private Key muss lokal auf dem Gateway erzeugt werden.
Meterwerk akzeptiert nur Ed25519-Public-Key als SPKI-PEM, kanonisiert ihn und
speichert ihn im bestehenden GatewayCredential-Modell. Private-Key-PEM,
andere Schlüsseltypen, ungültige Formate und abgelaufene Credentials werden
abgelehnt. Antwort und Audit enthalten Metadaten, kein Schlüsselmaterial.
Registrierung ist in NEW, PROVISIONING oder MAINTENANCE möglich.
Die neue UI bietet keine CREATE-/ROTATE-Schlüsselerzeugung an.

## E. CommunicationIdentity-Prozess

Öffentliche Broker-/Issuer-Referenzen, SHA-256-Fingerprint, Seriennummer,
CN und Gültigkeit werden registriert. CN muss die interne Gateway-ID sein.
Manuelle externe Freischaltung verlangt aktuelle Gültigkeit und keinen Widerruf.
Widerrufsbestätigung verlangt eine vorherige Anforderung; Bestätigungen sind
idempotent, serverzeitbasiert und atomar auditiert.
Sie bleiben nach Stilllegung möglich. Metadaten behaupten keine MQTT-Verbindung.

## F. Provisioning-Readiness

`getGatewayProvisioningReadiness` leitet den Zustand aus vorhandenen Daten ab:
Tenant, direkte Property, Stammdaten, PROVISIONING, gültiges aktives
Ed25519-Credential, gültige Kommunikationsidentität mit externer Freischaltung,
kein unbestätigter Widerruf, Kontakt des aktuellen Versuchs, bestätigte
Installation und geeignete konsistente Devices.

Modbus benötigt gültige Konfiguration, verifiziertes und unverändertes
Katalogprofil, Messungsreview der aktuellen Revision, bestätigte Nutzungseinheit
mit kWh, ACTIVE/completedAt und keine ungeklärten TEST-/READ-/START-/STOP-/
CONFIGURE-Aufträge der aktuellen Revision. Andere Protokolle benötigen
Device-Lifecycle ACTIVE. Fehlgeschlagene/stillgelegte/deaktivierte Devices
blockieren; es genügt nicht, dass ein anderer Teilnehmer bereit ist.

20 erreichbare Blocker werden einzeln in DB-Tests ausgelöst. Der zusätzliche
TENANT_MISSING-Fall ist durch den Tenant-Fremdschlüssel ausgeschlossen; dessen
Abweisung sowie unbekannte/fremde Gateway-IDs werden geprüft.

firstContactAt bleibt historisch. Ein nach provisioningStartedAt atomar
geschriebenes gateway.heartbeat-Audit mit expliziter Server-Empfangszeit
belegt den Kontakt des aktuellen Versuchs. Alte Heartbeats reichen nicht aus;
lastSeenAt aus dem signierten Gerätezeitstempel ist kein Ersatz.
Fehlende Audit-Evidenz blockiert konservativ.

## G. Aktivierungslogik

Nur PROVISIONING → ACTIVE. Erneute Readiness-Prüfung innerhalb einer
Serializable-Transaktion mit Tenant-/Gateway-/Device-Sperren, anschließend
ACTIVE, commissionedAt, Revision und Audit atomar. Gleichzeitiger Widerruf
und Auditfehler werden getestet. Heartbeats ändern den Lifecycle nicht.
MAINTENANCE verlangt einen bewussten neuen Provisionierungsversuch.

Installation wird in PROVISIONING mit Serverzeit bestätigt und auditiert;
Wiederholung ist idempotent. Historische installedAt-Werte ohne passenden
Bestätigungsnachweis reichen nicht. Keine beliebigen Browser-Datumswerte.

## H. Propertywechsel

Nur gleicher Tenant, NEW/MAINTENANCE, keine Devices und keine offenen Commands.
Dies gilt nun auch für die Erstanbindung von Legacy-NULL mit Devices.
Installation und Aktivierungsnachweis werden bei echtem Propertywechsel
entwertet. Keine automatische Umhängung oder Verschiebung von Messhistorie.

## I. Stilllegung

DECOMMISSIONED bleibt terminal. Bestehende atomare Sperren/Widerrufe/Stornierungen
werden verwendet. Devices bleiben eigenständig. Brokerwiderruf wird gesondert
als nicht angefordert, angefordert oder extern bestätigt dargestellt.
Kein behaupteter physischer Fernstopp und keine vollständige Sperrbehauptung
bei fehlendem externen Widerrufsnachweis.

## J. Legacy-/RBAC-Pfade

Neue Plattformmutationen verweigern TENANT_ADMIN, MANAGER und USER.
Auch `createPilotGateway` und `prepareAdminGateway` verlangen Property und
SUPER_ADMIN; Quota/Plan bleibt im bestehenden Dienst.
Gateway-Imports und Gateway-bezogene Device-Imports bleiben gesperrt.
Bestehende erlaubte Device-Kundenfunktionen bleiben erhalten.

Bewusst erhaltene Legacy-Ausnahme: POST `/api/gateways/[id]/credentials`
und POST `/api/platform/gateways/[id]/credentials` können für SUPER_ADMIN
weiterhin CREATE/ROTATE mit einmaliger Private-Key-Antwort ausführen.
`manageGatewayCredential` und `adminGatewayCredential` sowie ihre bestehenden
Tests benötigen diese Kompatibilität. Diese Funktionen sind kein angebotener
Pfad der neuen Provisioning-UI. Metadatenlesezugriffe für bisher berechtigte
Kundenadministratoren bleiben möglich, Plattformmutationen nicht.

## K. Tests

- Gezielte Gateway-DB-/Sicherheits-/UI-Suite: 171 Tests in drei Dateien.
- Vollständige Suite: 493 Tests in 47 Dateien, Exit-Code 0; gegenüber Phase 1C-A
  45 zusätzliche Tests.
- Isolierte Integration: 18 Basis-, 8 Import-, 6 Datenqualitäts- und 7 Regeltests,
  insgesamt 39 Prüfungen, Exit-Code 0.
- Fresh-/Upgrade-Migrationstests, Erfolgsaktivierung, einzelne Blocker,
  Quota-Abweisung, Audit-Rollbacks, neue Versuchskontakte, Signaturvalidierung,
  externe Bestätigungen, Propertywechsel und Nebenläufigkeit.
- HTTP-Origin-/Bestätigungs-/Tenant-/RBAC-Prüfungen einschließlich Legacy-Routen.
- UI-Tests rendern Server-/React-Komponenten; kein zusätzlicher interaktiver
  Browser-E2E-Lauf und keine Hardware-/Brokerprüfung.

Neue lokale Loopback-Cluster, keine bestehende Datenbank verändert. Der
Integrationshelfer seedet ausschließlich seinen frischen Testcluster mit
`SEED_DEMO=true`, stoppt ihn anschließend und erhält die lokalen Dateien.
Prüfaufrufe verwenden `corepack pnpm`, weil pnpm nicht direkt im PATH liegt.

## L. Migration nötig

**NEIN.** Kein Prisma-Schemadiff, keine neue Migration. Die isolierte
Migrationsprüfung bestätigt weiterhin 48 Migrationen und aktuellen DB-Stand.

## M. Typecheck / Lint / Build

Prisma generate, Typecheck, ESLint und Produktionsbuild erfolgreich.
Der ESLint-Befund zur State-Deklarationsreihenfolge wurde behoben.
Formatierung und Formatcheck ausschließlich für geänderte/neue Dateien;
keine projektweite Formatierung. `git diff --check` erfolgreich.
Bestehende nichtblockierende Vitest-esbuild/oxc- und pg-Deprecation-Warnungen.

## N. Secret-Scan

0 Review-Funde; 24 bekannte Demo-/Templatewerte. Keine echten Schlüssel,
Zertifikate oder Zugangsdaten angefordert oder verwendet. Synthetische
Testschlüssel entstehen nur im Speicher der Tests.

## O. git diff --stat

Git zählt neue unversionierte Dateien hier nicht mit; diese sind unter P aufgeführt.

```text
 README.md                                          |  64 +-
 docs/ARCHITECTURE.md                               |  61 ++
 .../platform-admin/gateways/[id]/page.tsx          | 161 +++-
 .../(platform)/platform-admin/gateways/page.tsx    |  41 +-
 src/components/gateway-admin-controls.tsx          | 240 ++----
 src/server/gateway-admin.ts                        | 110 ++-
 src/server/gateway-communication-identity.ts       |  77 ++
 src/server/gateway-credentials.ts                  | 107 ++-
 src/server/gateway-ingestion.ts                    |   1 +
 src/server/gateway-lifecycle.ts                    | 272 ++++---
 tests/gateway-admin-ui.test.ts                     | 129 ++-
 tests/gateway-device-security-db.test.ts           |   2 +
 tests/gateway-provisioning-db.test.ts              | 890 ++++++++++++++++++++-
 13 files changed, 1820 insertions(+), 335 deletions(-)
```

## P. git status --short

Alle Änderungen bleiben uncommittet.

```text
 M README.md
 M docs/ARCHITECTURE.md
 M src/app/(platform)/platform-admin/gateways/[id]/page.tsx
 M src/app/(platform)/platform-admin/gateways/page.tsx
 M src/components/gateway-admin-controls.tsx
 M src/server/gateway-admin.ts
 M src/server/gateway-communication-identity.ts
 M src/server/gateway-credentials.ts
 M src/server/gateway-ingestion.ts
 M src/server/gateway-lifecycle.ts
 M tests/gateway-admin-ui.test.ts
 M tests/gateway-device-security-db.test.ts
 M tests/gateway-provisioning-db.test.ts
?? docs/PHASE-1C-B-VERIFICATION.md
?? src/app/api/platform/gateways/[id]/provisioning/
?? src/app/api/platform/gateways/properties/
?? src/components/gateway-provisioning-controls.tsx
?? src/server/gateway-provisioning.ts
?? src/server/gateway-readiness.ts
```

## Q. Offene Punkte für Phase 1C-C / 1D

- Echte Gateway-lokale Schlüsselbereitstellung und Betriebsabläufe außerhalb
  dieses manuellen Verwaltungsworkflows.
- Externe PKI-/Brokerprozesse samt organisatorischer Nachweisführung; keine
  automatische Zertifikatsausstellung, CA-/ACL- oder MQTT-Steuerung.
- Gesonderter sicherer Legacy-/Umzugs-/Importworkflow für belegte Gateways.
- Geplante Ablösung der ausdrücklich dokumentierten Legacy-Private-Key-APIs
  erst nach Prüfung ihrer Aufrufer.
- Audit-Aufbewahrung und Abfrageleistung für große Flotten beobachten;
  entfernte Kontakt-/Installationsnachweise führen absichtlich zu Blockern.
- Interaktive Browser-E2E-/reale Betriebsabnahme separat beauftragen.
- Kein Claim-Code, QR-Pairing, Zero-Touch, Firmware- oder Remote-Command-Ausbau
  Bestandteil dieser Phase.
