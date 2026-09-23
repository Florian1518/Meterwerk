# Rules Engine (Phase 5i, Teil 1)

Regeln gehören immer genau einem Mandanten. Die Sichtbarkeit wird serverseitig über die aktuelle Sitzung bestimmt; `tenantId` von Kunden wird nicht aus dem Request übernommen. SUPER_ADMIN muss einen Mandanten auswählen. Liegenschaft, Zähler, Gateway und Medium sind optionale Einschränkungen und werden beim Speichern auf dieselbe Mandantenzugehörigkeit geprüft. Zusammengesetzte Fremdschlüssel verhindern fremde Zuordnungen auch direkt in PostgreSQL.

Unterstützte Trigger sind `READING_CREATED`, `ALARM_CREATED`, `ALARM_STATUS_CHANGED`, `METER_ONLINE`, `METER_OFFLINE`, `GATEWAY_ONLINE`, `GATEWAY_OFFLINE` und `SCHEDULED_CHECK`. Die Auswertung erfolgt über `processRuleEvent`; zeitgesteuerte Prüfungen werden mit `runScheduledRules` ausgelöst. Diese Phase führt keinen Hintergrund-Worker und keine reale Gerätekommunikation ein. Eine spätere Ingestion- oder Scheduler-Komponente kann die typisierten Serverfunktionen aufrufen.

Bedingungen sind ausschließlich strukturierte JSON-Objekte, die durch Zod validiert werden:

- `GREATER_THAN`, `LESS_THAN`, `EQUALS`, `BETWEEN` für Verbrauch, Registerwert, Messwert, Offline- und Fehlwertdauer;
- `TIME_WINDOW` mit UTC-Uhrzeitfenster und expliziter Zeitzonenbezeichnung;
- `DURATION_AT_LEAST` für Offline-, Fehlwert- oder bereits aggregierte Ereignisdauer (`durationMinutes`), etwa zusammen mit `GREATER_THAN` für Leistung/Verbrauch über 15 Minuten;
- `MEDIUM_EQUALS`, `METER_EQUALS` und `PROPERTY_EQUALS`.

Eine Regel verknüpft Bedingungen mit AND. Nicht vorhandene Messwerte werden nicht als Null interpretiert. Uhrzeitfenster über Mitternacht werden unterstützt. Es gibt keinen Interpreter, keine `eval`-Funktion, keine Templates mit Code und keine frei ausführbaren JavaScript-Ausdrücke.

Die ersten Aktionen sind `CREATE_ALARM` mit Titel und Schweregrad sowie `SET_METER_STATUS` mit einem festen Zählerstatus. Aktionen werden nach Priorität aufsteigend verarbeitet. Jede Auswertung wird mit Tenant, Regel, Trigger, idempotentem `eventKey`, Treffer und Aktionsanzahl in `RuleExecution` protokolliert. Ein bereits verarbeiteter `eventKey` wird nicht erneut ausgeführt; dadurch erzeugen Wiederholungen keinen zweiten Alarm.

Die API ist unter `/api/rules` verfügbar: `GET` listet Regeln, `POST` legt eine Regel an, `PUT` aktualisiert sie, `DELETE` löscht sie, `GET /api/rules/:id` liefert Ausführungen und `POST /api/rules/run` startet zeitgesteuerte Prüfungen. Jede Route authentifiziert selbst, validiert JSON, erzwingt Rollen und schreibt AuditEvents. Die Verwaltung steht unter `/rules` für TENANT_ADMIN und SUPER_ADMIN bereit.

Grenzen von Teil 1: Es gibt noch keinen persistenten Scheduler, keine Regelversionierung, keine komplexe OR-Gruppierung, keine E-Mail-/Webhook-Aktion und keine automatische Verdichtung langer Offline-Zeiten. CREATE_ALARM erzeugt ausschließlich einen Meterwerk-Alarm in PostgreSQL; Hardware, externe Nachrichten und Gerätebefehle bleiben ausdrücklich außen vor.

## Teil-3-Erweiterungen

REST- und Utility-Ingestion melden neue Messwerte nach erfolgreicher Transaktion an die Engine. Alarm-Acknowledge und Resolve erzeugen ALARM_STATUS_CHANGED-Ereignisse. AND-/OR-Gruppen sind strukturiert validiert und auf drei Verschachtelungsebenen begrenzt. Regel�nderungen erzeugen unver�nderliche RuleVersion-Datens�tze; RuleExecution.ruleVersion dokumentiert die verwendete Definition.

Aktionen umfassen Alarmanlage und -aktualisierung, Webhook-Outbox, persistente E-Mail-Jobs, Z�hler- und Gatewaystatus. Cooldown, maximale Frequenz, Replay-Schutz, Deduplizierung und begrenzte Eventtiefe verhindern Mehrfachausf�hrung und Endlosschleifen. E-Mail-Jobs verwenden persistente Retry-/Backoff-Felder.

Der Worker l�uft separat mit pnpm rules-worker. F�lligkeit, Sperren, Versuche, nextAttemptAt, lastError und Jobstatus liegen in PostgreSQL, daher �berlebt der Scheduler Neustarts. Den Worker als eigenen Prozess oder Container starten und Prozesslebenszeichen, Datenbankzugriff sowie den �ltesten f�lligen Job �berwachen. Es wird keine reale Hardware angebunden.
