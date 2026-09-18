# Meterwerk – Projektregeln

## Verbindliche Standards

- TypeScript strict, Next.js App Router, React Server Components als Standard. Client-Komponenten nur für Interaktion.
- PostgreSQL und Prisma sind die Datenquelle. Keine impliziten Demo-Fallbacks bei Datenbankfehlern.
- Fachliche Datenzugriffe ausschließlich über `src/server/`. Jeder Einstiegspunkt authentifiziert selbst; Layout-Prüfungen allein reichen nicht.
- `tenantId` kommt für Kunden aus der aktuellen Datenbanksitzung. Kundenparameter niemals ungeprüft übernehmen. SUPER_ADMIN muss explizit einen Mandanten auswählen.
- Jede neue fachliche Tabelle trägt `tenantId`. Zusammengesetzte Fremdschlüssel sichern die Mandantenzugehörigkeit entlang der Hierarchie.
- USER benötigt explizite PropertyGrant-Freigaben. Diese gelten für alle Nachfahren, Aggregationen, Detailseiten und Exporte. Ohne Freigabe keine Daten.
- Keine Passworthashes, Sitzungstoken oder Secrets an Clients, in Logs oder ins Repository schreiben. Benutzerabfragen verwenden sichere Selects.
- Mutationen: Zod-Validierung, Rollenprüfung, Mandantenprüfung, atomarer AuditEvent. Keine Massenzuweisung unvalidierter Request-Felder.
- Tests für neue Zugriffspfade enthalten fremde IDs, fremde Mandanten, USER ohne Freigabe und Rolleneskalation.
- Keine Einheiten vermischen. Messwerte in Decimal, Zeitstempel in UTC, Berichtszeitzone und Zeiträume sichtbar machen. Geldbeträge für Abrechnung nicht mit JS-Gleitkommaarithmetik berechnen.
- Geräteintegration verwendet später separate Credentials und Queues, niemals Benutzer-Cookies als Gerätezugang.
- Migrationen versionieren; keine `db push`-Änderungen an gemeinsam genutzten Datenbanken.
- Demo-Seed nur ausdrücklich mit SEED_DEMO=true in Entwicklung. Bestehende Daten und Passwörter nicht automatisch überschreiben.
- Keine realen Nachrichten, Geräteverbindungen oder Abrechnungen ohne konkreten Auftrag.

## Prüfen

`pnpm db:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration` (lokale Demo-Datenbank), `pnpm build`.
Architekturentscheidungen in `docs/ARCHITECTURE.md`, Einschränkungen und Startschritte in README aktuell halten.

## Oberfläche

Deutsche Oberfläche, responsive Ansichten, beschriftete Formulare, zugängliche Tabellen und sichtbare Fehler-/Leerzustände. shadcn/ui-Komponenten in `src/components/ui`. Keine unverbundenen Aktionsbuttons oder erfundenen Live-Statusanzeigen.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
