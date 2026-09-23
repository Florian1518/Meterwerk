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

## Tests und Grenzen

`pnpm test` enthält Statusautomat-, Schema-, Server- und HTTP-Vertragstests. `pnpm test:field-service` führt PostgreSQL-Integrationstests gegen die lokale migrierte Demo-Datenbank `meterwerk` mit `SEED_DEMO=true` aus. Der Test verwendet eigene zufällige Tenant-Fixtures, ersetzt nur die Sitzungsauflösung und bereinigt ausschließlich die eigenen Datensätze. Datenbankzugriffe und Fremdschlüssel sind real. Bestehende Integrationstests: `pnpm test:integration`.

Bekannte lokale Startblockade: `uv_os_get_passwd returned ENOMEM` in tsx vor Ausführung des Projektcodes. Im aktuellen Lauf tritt sie sowohl bei `db:local` als auch `test:integration` innerhalb der Windows-Sandbox auf. Außerhalb der Sandbox scheitert der lokale Datenbankstart mit einer unbehandelten `undefined`-Exception; die vorhandene Integrationssuite meldet anschließend `ECONNREFUSED`. Diese Läufe gelten nicht als bestandene Integrationstests.

Die separate Field-Service-Integrationssuite scheitert ebenfalls bereits beim `SELECT 1` vor Erstellung der Test-Fixtures; alle sieben Datenbanktests bleiben dadurch unausgeführt. Die Migration wurde in dieser Umgebung nicht auf eine laufende Datenbank angewendet. `pnpm test` besteht mit 175 Tests in 26 Dateien, darunter 43 neue Field-Service-Server-/Vertrags-/API-Tests. Der vollständige Prettier-Lauf erforderte zusätzlich reine Formatkorrekturen in den vorhandenen Analytics-/Dashboard-Seiten und zwei bestehenden Fach-Dokumentationen.

Teil 2: Offline-Synchronisation/Konfliktbehandlung, Anhänge/Fotos/Unterschriften, wiederverwendbare Checklisten-Vorlagen und nachträgliche Strukturversionen, Kalender/Disposition, Benachrichtigungen, zusätzliche explizite Einsatzfreigaben oder separate Technikerrolle sowie paginierte Listen/Historie für große Bestände. Der erste Teil liefert alle berechtigten Aufträge ohne stille Begrenzung. Zählerwechsel/Inbetriebnahme sind hier Auftragstypen; sie führen keine Gerätekommandos oder fachlichen Zählerwechsel aus.
