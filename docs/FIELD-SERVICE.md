# Field Service – Phase 5m, Teil 1

## Start

Vor dem Anwendungsstart `pnpm db:generate` und `pnpm db:migrate` ausführen. Die additive Migration `202609240012_field_service` erzeugt ausschließlich die neuen Tabellen, Indizes, Enums und zusammengesetzten Fremdschlüssel. Kein Seed, keine Passwortänderung, keine reale Hardware, Nachrichten oder Abrechnung.

Einstiege: `/work-orders`, `/work-orders/new`, `/work-orders/[id]` und `/technician`. Die bestehende responsive Shell, PWA-Installation, Offline-Anzeige und shadcn-Buttons werden wiederverwendet. Änderungen und Datenabrufe benötigen eine Online-Verbindung. Geschützte Daten werden nicht im Service Worker gespeichert. Alle Eingaben und Anzeigen von Terminen verwenden ausdrücklich UTC; „Heute“ umfasst 00:00 inklusive bis zum folgenden 00:00 exklusiv in UTC.

## Daten und Rechte

- `WorkOrder`: tenantgebundener Auftrag mit automatisch generierter, je Tenant eindeutiger `EA-UUID`, Titel, Beschreibung, Typ/Priorität/Status, obligatorischer Liegenschaft und optionalem Gebäude, Einheit, Zähler und Gateway; Termin, tatsächlichem Beginn/Ende, internem Ansprechpartner, Kundenkontakt als Text, Notizen und Zeitstempeln.
- `TechnicianAssignment`: eindeutige Zuordnung Auftrag/Benutzer; zusammengesetzte Tenant-Fremdschlüssel auf beide Seiten.
- `WorkOrderStatus` ist ein festes Prisma/PostgreSQL-Enum. Statushistorie liegt in atomaren `AuditEvent`-Einträgen und nicht in veränderbaren Konfigurationstabellen.
- `WorkOrderChecklist`, `ChecklistItem`: strukturierte Listen mit Reihenfolge, Titel, Beschreibung, Pflichtkennzeichen, Erledigung, Kommentar, Bearbeiter und Zeitpunkt.
- `WorkOrderComment`: unveränderliche Kommentare mit Autor und Datum.

TENANT_ADMIN und MANAGER verwalten Einsätze im eigenen Tenant. MANAGER hat gemäß bestehendem Rollenmodell Zugriff auf dessen Liegenschaften; es wird keine neue globale Rollenberechtigung eingeführt. SUPER_ADMIN wählt explizit einen Tenant und liest/diagnostiziert, darf hier nicht mutieren.

Techniker sind in Teil 1 bestehende aktive USER. Eine Zuweisung setzt eine explizite PropertyGrant-Freigabe voraus. Jeder USER-Zugriff erfordert gleichzeitig Tenant, Liegenschaftsfreigabe und persönliche Zuweisung – einschließlich Details, Kommentaren, Checklisten und Audit-Historie. Entzug der Freigabe wirkt beim nächsten Zugriff. Eine Zuweisung erteilt keine zusätzlichen Liegenschaftsrechte. Nur USER werden als Techniker zugewiesen; eine separate Technikerrolle wird nicht eingeführt. USER dürfen starten, pausieren, fortsetzen, Checklisten ausfüllen, kommentieren und abschließen; Planung, Zuweisung, Auftragsänderung, Abbruch und Checklistendefinition bleiben der Verwaltung vorbehalten.

Alle öffentlichen Server-Datenfunktionen lesen selbst die Datenbanksitzung. Kunden-Tenants werden niemals aus dem Request übernommen. APIs authentifizieren zusätzlich und nutzen die bestehende Origin-, JSON-, Größen- und Fehlerprüfung. Sichere Benutzer-Selects liefern ausschließlich notwendige Anzeige-/Freigabefelder.

Alle neuen Tabellen enthalten tenantId; zusammengesetzte Fremdschlüssel sichern die Mandantenzugehörigkeit. Zusätzlich prüft die Serverlogik die tatsächliche Liegenschaft/Gebäude/Einheit/Zähler-Hierarchie. Gateways haben im bestehenden Modell keine Liegenschaftsrelation und werden deshalb tenantgebunden geprüft. Ein Liegenschaftswechsel mit bestehenden Zuweisungen wird abgelehnt.

## Ablauf und Historie

`DRAFT → PLANNED → ASSIGNED → IN_PROGRESS → COMPLETED`; zusätzlich `IN_PROGRESS → PAUSED → IN_PROGRESS`. `ASSIGNED → PLANNED` erlaubt Neuplanung/Entfernung der letzten Zuweisung. Jeder nicht terminale Status darf durch die Verwaltung nach `CANCELED` wechseln. Weitere Sprünge, Wiedereröffnung sowie Änderungen an abgeschlossenen/abgebrochenen Einsätzen werden abgelehnt.

Planung braucht einen Termin. Zuweisungsbestätigung und Start brauchen mindestens einen aktiven, freigegebenen Techniker. Start setzt den tatsächlichen Beginn genau einmal; Fortsetzen überschreibt ihn nicht. Abschluss/Abbruch setzt das Ende. Abschluss ist nur aus IN_PROGRESS möglich und wird bei offenen Pflichtpunkten abgelehnt. Checklisten werden ausschließlich in IN_PROGRESS ausgefüllt. Texte werden als Text gerendert; es gibt keine Script-/Formelausführung. Unbekannte strukturierte Eingabefelder werden abgelehnt.

Jede Mutation und ihr AuditEvent teilen eine Datenbanktransaktion. Bestehende Aufträge werden vor Mutation über `SELECT … FOR UPDATE` gesperrt; auch Checklistenänderungen nutzen dieselbe Sperre. Damit kann ein gleichzeitiger Abschluss keine ungespeicherten Pflichtpunktänderungen überholen. Historie enthält Akteur, Zeitpunkt und relevante Vorher-/Nachher-Werte. Entwürfe können logisch gelöscht werden; Daten und Audit bleiben erhalten. Geplante Aufträge werden abgebrochen statt gelöscht. Kindobjekte werden nicht physisch über die API gelöscht.

## API

Basis `/api/work-orders`, optionale Query `tenantId` (für SUPER_ADMIN erforderlich). Antworten `private, no-store`.

| Methode/Pfad                                           | Funktion                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| GET /                                                  | Berechtigte Aufträge                                          |
| POST /                                                 | Entwurf erstellen                                             |
| GET /mine?view=mine\|today\|planned\|active\|completed | Persönliche Einsätze                                          |
| GET /options                                           | Sichere Auswahlwerte für Verwaltung                           |
| GET /:id                                               | Detail inklusive Checklisten, Kommentaren und Historie        |
| PATCH /:id                                             | Stammdaten und Termin ändern                                  |
| DELETE /:id                                            | Nur Entwurf logisch löschen                                   |
| GET /:id/assignments                                   | Zuweisungen                                                   |
| POST /:id/assignments                                  | `{ userId }` zuweisen                                         |
| DELETE /:id/assignments/:userId                        | Zuweisung entfernen                                           |
| POST /:id/status                                       | `{ status }` validierter Übergang                             |
| GET /:id/checklists                                    | Checklisten                                                   |
| POST /:id/checklists                                   | `{ title, items: [{ title, description, required, order }] }` |
| PATCH /:id/checklist-items/:itemId                     | `{ completed, comment }`                                      |
| GET /:id/comments                                      | Kommentare                                                    |
| POST /:id/comments                                     | `{ body }` hinzufügen                                         |
| GET /:id/history                                       | Audit-Historie                                                |

Mutationseingaben enthalten keine tenantId, Rollen, Statusumgehungen oder Bearbeiterfelder. Schema: `src/lib/field-service.ts`. Die Auftragsnummer wird serverseitig generiert. Kommentar-/Listen-APIs haben keine frei ausführbaren Ausdrücke.

## Teil 2: Dokumentation und mobile Bearbeitung

Im Einsatzdetail stehen strukturierter Arbeitsbericht, ausgeführte Arbeiten, Mängel, Empfehlungen, interne und Kundennotizen sowie tatsächlicher Beginn/Ende bereit. Einsatzdauer wird daraus in Minuten berechnet. System-Start/-Ende aus den Statuswechseln bleiben separat erhalten. Mehrere Techniker können mehrere Zeitblöcke erfassen; Überschneidungen je Techniker werden innerhalb des Einsatzes abgelehnt. USER erfassen ausschließlich eigene Zeiten, Verwaltung kann Zeiten zugewiesener Techniker dokumentieren. Korrekturen verlangen eine Begründung und erhalten ein atomisches Vorher-/Nachher-Audit. Keine Lohnabrechnung oder Warenwirtschaft.

Zählerwechsel lassen sich mobil über alte/neue Zähler-ID, Zählerstände, UTC-Ausbau/-Einbauzeiten und Grund erfassen. Derselbe bestehende MeterReplacement-Kern wird aufgerufen; alternativ ist die ID eines bestehenden passenden Protokolls verwendbar. Alte/neue Seriennummer, Medium und Einheit kommen aus den Zählerdaten, Kontakte/Bemerkungen und beide hochgeladenen Zählerfotos aus dem Einsatz. Inbetriebnahme für INSTALLATION/COMMISSIONING dokumentiert Gerät, Seriennummer, Protokoll/Profil, Ort, fünf manuelle Prüfbestätigungen, Ergebnis und Bemerkungen. Keine Gerätekommunikation.

Fotos/Anhänge: maximal 10 MiB, JPEG/PNG/PDF/TXT, Kategorien BEFORE/AFTER/DEFECT/METER/GATEWAY/DOCUMENT/OTHER. Kameraauswahl ist mobil möglich. Download erfolgt ausschließlich nach erneuter Tenant-/Grant-/Zuweisungsprüfung. Der lokale Storage ist eine Entwicklungsfunktion; produktive Uploads liefern bis zum echten Object-Storage-Adapter 503. Es gibt keine öffentliche Dateiauslieferung und keinen implementierten Virenscanner.

Unterschriften werden nach fertiggestellter Dokumentation und erledigter Pflichtcheckliste per Finger/Stift erfasst. Es handelt sich um Einsatz-/Abnahmebestätigungen, keine qualifizierten elektronischen Signaturen. Eine Technikerbestätigung muss durch einen zugewiesenen Techniker erfolgen. Kundenname/-bestätigung wird im Technikerworkflow erfasst. Vorhandene Signaturen sind unveränderlich und sperren die fachlichen Einsatzdaten. Ein nachträglicher Korrektur-/Nachtragsprozess ist noch nicht Teil dieser Phase.

Checklistenvorlagen können bei der Einsatzerstellung angelegt und ausgewählt oder im Detail übernommen werden. Typ/Medium und optionales Geräteprofil werden geprüft. Signaturpflichten sind in der Vorlage konfigurierbar. Kopien der Punkte bleiben unabhängig von späteren Vorlagenänderungen. Bestehende Vorlagen sind über PATCH /templates/:id versioniert bearbeitbar; ein eigener komfortabler Vorlagen-Verwaltungsbildschirm ist noch offen.

Der Abschluss verlangt serverseitig erledigte Pflichtpunkte, Bericht/Arbeiten, tatsächliche Einsatzzeiten, mindestens einen Nettozeitblock innerhalb dieser Zeiten, ein verknüpftes Zählerwechselprotokoll bzw. erfolgreiches Inbetriebnahmeprotokoll je Typ sowie konfigurierte Bestätigungen. Ein fehlgeschlagenes Inbetriebnahmeprotokoll verhindert COMPLETED.

### Zusätzliche API

- POST /api/work-orders/:id/documentation: { requestId, revision, mutation: { kind, value } }; Arten documentation, commissioning, material, time, signature, replacement, template.
- GET/POST /api/work-orders/templates und PATCH /api/work-orders/templates/:id: Vorlagenverwaltung für MANAGER/TENANT_ADMIN.
- POST /api/work-orders akzeptiert optional templateId und übernimmt die Vorlage atomar.
- POST /api/attachments: Multipart mit targetType=WORK_ORDER, entityId, file, requestId, description, category.
- GET /api/attachments/:id: autorisierter Download, niemals öffentliche Storage-URLs.

Mutationen nutzen strikte Zod-Verträge, aktuelle Sitzung, Tenant/Grant/Zuweisung, Auftragssperre und atomisches Audit. Übertragungen werden per UUID und Digest gegen Duplikate geschützt; bereits bestätigte Requests liefern beim Replay dieselbe Revision. Neue Schreibvorgänge mit veralteter Revision werden abgelehnt. Die PWA-Struktur aus Phase 5l bleibt unverändert: kein Cache für fachliche API-Daten. Tab-Arbeitsspeicher hält Eingaben und ausstehende Requests bei kurzen Verbindungsabbrüchen. Wiederholung ist explizit per Speichern möglich; ein Tab-/Browserneustart verliert diese Daten. Keine sensiblen Daten in localStorage, sessionStorage oder IndexedDB. Es gibt keinen automatischen Konfliktmerge.

## Migrationen und Tests (Teil 2)

Teil 1 war bei Beginn sauber als 2f4e4e3 (WIP Phase 5m part 1) committed. Kein Reset und kein finaler Phase-5m-Commit. Migrationen 202609240012_field_service und 202609240013_field_documentation sind über pnpm db:migrate anzuwenden; kein db push und kein erneutes Seeding.

In dieser Shell fehlt pnpm im PATH; die installierten CLIs wurden direkt mit node gestartet. Prisma generate/validate, TypeScript, ESLint, vollständiger Prettier-Check und Produktionsbuild bestehen über die vorhandenen Abhängigkeiten. Unit-/Vertragstests: 195 Tests in 28 Dateien bestanden. Acht isolierte Playwright-Tests auf Desktop und Pixel-7-Mobile prüfen echte Formulare mit simulierten API-Antworten: Eingabeerhalt offline, Reconnect, unveränderte Request-ID/Nutzlast nach verlorener Antwort, Vorlagen- und Zählerwechselmasken sowie kein persistenter Browserspeicher. Diese Tests ersetzen keine Ende-zu-Ende-Prüfung gegen PostgreSQL.

PostgreSQL ist lokal auch außerhalb der Sandbox nicht erreichbar (migrate deploy: P1001). Die Field-Service-Datenbanksuite scheitert beim SELECT 1 vor den Fixtures; acht Tests bleiben unausgeführt. Sie enthält die Teil-1-Tests plus paralleles Replay, Decimal-Material, Vorlagensnapshot, Fremdschlüssel und fremde Tenant-/Grant-Zugriffe. Die allgemeine Integrationssuite scheitert in der Sandbox vor Projektstart mit uv_os_get_passwd returned ENOMEM. Erneuter Lauf außerhalb: ECONNREFUSED. Auch der vorhandene lokale Datenbankstarter scheitert außerhalb mit einer undefined-Exception. Deshalb sind beide Migrationen und echte Datenbanktests offen, nicht bestanden. Vor Produktiveinsatz gegen eine erreichbare lokale Demo-Datenbank nachholen.

Für spätere Phasen bleiben Malwareprüfung, ein expliziter Nachtragsprozess nach Bestätigung, weitergehende Dispositionsregeln und ein Scheduler für automatische Start-/Überfälligkeitsbenachrichtigungen. Dauerhafte Offline-Datenhaltung, Lohnabrechnung, Warenwirtschaft, reale Gerätekommunikation und externe Kalenderplattformen sind nicht implementiert.

## Teil 3: Disposition, Benachrichtigungen, Bericht und Nachträge

Die Disposition ist unter `/work-orders/calendar` tenantgebunden verfügbar. Tag und Woche verwenden UTC-Zeiträume. Filter arbeiten nach Techniker, Status, Priorität und Liegenschaft. Jede Karte zeigt Termin, Status, Priorität, Liegenschaft und alle zugeordneten Techniker. Überschneidungen werden je Techniker aus dem geladenen Zeitraum als Konflikthinweis markiert; es gibt keine externe Kalenderintegration. Terminänderungen laufen über `PATCH /api/work-orders/:id/schedule` und werden auditiert.

Die bestehende Mail-Abstraktion liefert `notifyWorkOrder` für `WORK_ORDER_ASSIGNED`, `WORK_ORDER_RESCHEDULED`, `WORK_ORDER_STARTING`, `WORK_ORDER_OVERDUE`, `WORK_ORDER_COMPLETED`, `WORK_ORDER_CANCELED` und `WORK_ORDER_CRITICAL_DEFECT`. E-Mail-Empfänger sind nur aktive, zugewiesene Benutzer desselben Tenants mit aktivierter Präferenz. Der Text enthält keine Geheimnisse, Tokens oder Signaturdaten. Der aktuelle API-Endpunkt ist `POST /api/work-orders/:id/notify`; periodische „bald“-/„überfällig“-Auslösung bleibt ein Worker-/Scheduler-Schritt für Teil 4.

Nach COMPLETED erzeugt `GET /api/work-orders/:id/report` einen tenantgesicherten PDF-Einsatzbericht. Er enthält Auftragsnummer, Liegenschaft, Termin, Techniker, Arbeitsbericht, Arbeiten, Mängel, Empfehlungen, Checklistenstatus, Material-/Zeit-/Signaturhinweise, Zählerwechsel, Inbetriebnahme, Nachträge sowie Anhänge als interne Referenzen. Der Download nutzt `private, no-store`, `nosniff` und eine Attachment-Disposition. Ein Bericht ist erst nach serverseitig gültigem Abschluss verfügbar.

Nachträge liegen in `WorkOrderAddendum` und tragen Titel, Beschreibung, Grund, Aufwandsschätzung, Material und die Statusfolge DRAFT, REQUESTED, APPROVED, REJECTED, COMPLETED. `POST /api/work-orders/:id/addenda`, `GET /api/work-orders/:id/addenda` und `PATCH /api/work-orders/:id/addenda/:addendumId` sind tenant- und berechtigungsgeprüft. Die einfache mobile Erfassung baut keine Faktura oder Preislogik.

Der Storage-Zugriff ist über `src/server/storage.ts` providerunabhängig. Entwicklung verwendet den geschützten lokalen Pfad mit Tenant-Präfix. Mit `ATTACHMENT_STORAGE=s3` wird ein S3-kompatibler Endpoint über serverseitige Konfiguration für PUT/GET/DELETE verwendet; Bucket und Token bleiben serverseitig. Öffentliche Buckets sind nicht vorgesehen. MIME, Dateisignatur, Endung und 10-MiB-Limit werden vor dem Schreiben geprüft. `deletedAt` und `expiresAt` sind für Retention vorgesehen. Die autorisierte Downloadroute prüft weiterhin Sitzung, Tenant, PropertyGrant/Zuweisung und WorkOrder. Signatur-Tokens können serverseitig mit der bestehenden stabilen Anwendungsschlüsselbasis erzeugt/geprüft werden; sie umgehen keine fachliche Tenant-Prüfung.

Die Auswahlmasken im Kalender verwenden ausschließlich tenantgebundene Optionen. Gebäude, Einheiten, Zähler und Gateways bleiben über die bestehende hierarchische Auswahl und serverseitige Referenzprüfung geschützt; eine Auswahl darf keine fremde ID einschleusen. Die Kalenderfilter sind mobil als beschriftete native Selects bedienbar.

Teil-3-Sicherheitsgrenzen umfassen WorkOrder-/Attachment-ID-Manipulation, Cross-Tenant-Einsatz- und Zählerwechselzugriffe, fremde Technikerzuweisungen, geschützte PDFs, Storage-Pfade, Nachtrags-Statuswechsel, Upload-MIME/Größe, Signatursperren und Statusübergänge. Kalender und PDF laden jeweils gezielte Includes statt pro Karte zusätzliche Abfragen; die vorhandene Detailseite lädt die strukturierten Einsatzdaten in einer Prisma-Abfrage. Sehr große Historien/Anhänge und mehrseitige PDFs benötigen für Teil 4 Pagination bzw. Streaming.

Die Migration `202609240014_field_service_part3` ergänzt Addenda, Storage-Lifecycle-Felder und die Tenant-Fremdschlüssel. Sie wird ausschließlich über `pnpm db:migrate` angewendet. Im aktuellen Lauf bleibt PostgreSQL bei `P1001` unerreichbar; die Migration wurde nicht angewendet.
