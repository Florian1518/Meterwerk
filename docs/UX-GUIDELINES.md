# Meterwerk UX-Guidelines

Stand: 22. September 2026, Phase 5e Teil 3.

## Sprache und Orientierung

Die Oberfläche ist deutsch. Jede Seite hat eine erkennbare Hauptüberschrift; reguläre Seiten erhalten einen eigenen Dokumenttitel für die Ankündigung bei Navigation. Breadcrumbs, aktive Navigation einschließlich Zählernachfahren, Einheiten und Datenherkunft bleiben sichtbar. Fehler, fehlende Freigaben, fehlende Messwerte und unvollständige Tarifdeckung müssen ausdrücklich erkennbar sein. Keine erfundenen Live-Anzeigen oder unverbundenen Aktionen ergänzen.

## Tastatur, Fokus und Semantik

- Der erste Sprunglink führt zu `#main-content`; der Hauptbereich ist programmatisch fokussierbar.
- Links navigieren, Buttons lösen Aktionen aus. Formulare verwenden native, beschriftete Eingaben. Für Filter und Anzeigepräferenzen sind die zugänglichen Namen eindeutig.
- Sichtbarer Fokus gilt für Links, Buttons, Eingaben, Selects, Textareas, Summary und fokussierbare Scrollbereiche. Suchgruppen erhalten einen zusätzlichen `:focus-within`-Rahmen.
- Bearbeitungsdialoge verwenden `dialog.showModal()`. Escape schließt; der Browser begrenzt den Fokus auf den Dialog und stellt den vorherigen Fokus wieder her.
- Die globale Suche zeigt echte Links in einer benannten Navigation. Tab erreicht die Treffer; Escape schließt die Liste und fokussiert das Suchfeld. Keine Listbox-Rolle ohne passende Options- und Tastaturimplementierung.
- Suchanfragen werden verzögert und bei Änderungen abgebrochen. Veraltete Ergebnisse einer anderen Suchanfrage oder Mandantenauswahl werden nicht angezeigt. Ladezustand, Trefferzahl und Verbindungsfehler werden angekündigt.
- Tabellen bleiben semantische Tabellen. Die gemeinsame Tabelle bietet Caption, Spaltenüberschriften und `aria-sort`. Nur die Trefferzahl ist ein Live-Bereich, nicht die ganze Tabelle. Horizontale Tabellenregionen sind per Tastatur fokussierbar.
- Diagramme haben eine Beschreibung und eine aufklappbare Wertetabelle als Tastaturalternative zu Hover-Werten. Das SVG unterstützt auch 0, 1, 7 und 90 Tage und verwendet eindeutige Gradient-IDs.
- Status wird auch als Text vermittelt. Bewegung berücksichtigt `prefers-reduced-motion`.

Automatische axe-Prüfungen verwenden WCAG 2 A/AA und 2.1 AA. Sie ersetzen keine vollständige Prüfung mit Screenreader, Vergrößerung, Sprachsteuerung und Nutzertests. Es wird keine vollständige WCAG-Konformität bescheinigt.

## Responsive Darstellung

Desktop und mobile Ansichten teilen dieselben Inhalte und Berechtigungen. Auf kleinen Displays wechseln Formulare auf eine Spalte, die Suche erhält ihre volle verfügbare Breite und Navigationseinträge bleiben in einer horizontal scrollbareren Leiste erreichbar. Die Desktop-Seitenleiste ist bei geringer Höhe scrollbar. Tabellen scrollen innerhalb benannter Regionen, nicht die gesamte Seite. Mobile Bedienelemente erhalten in den gemeinsamen Regeln mindestens 44 Pixel Höhe. Kleine gemeinsame Hilfstexte verwenden mindestens 11 Pixel.

Die Browserprüfung verwendet 1440 × 1000 Pixel und das Pixel-7-Profil. Zusätzlich zur Accessibility-Analyse wird unbeabsichtigter horizontaler Seitenüberlauf geprüft. Reale Mobilgeräte, weitere Browser-Engines und 400-%-Zoom bleiben ergänzende manuelle Prüfungen.

## Zahlen, Geld und Einheiten

`src/lib/format.ts` definiert deutsche Präsentationsformate. Interne Decimal-Werte bleiben bis zur Darstellung exakte Dezimalstrings; insbesondere Geld wird nicht zur Berechnung in JavaScript-Gleitkommazahlen umgewandelt.

| Inhalt            | Darstellung / Regel                                          |
| ----------------- | ------------------------------------------------------------ |
| Datum             | `22.09.2026`                                                 |
| Zeitpunkt         | `22.09.2026, 12:30:00 GMT+2`, mit sichtbarer Anzeigezeitzone |
| Zahl              | `1.234,5`                                                    |
| Geldbetrag        | `1.234,50 €`, zwei Nachkommastellen                          |
| Tarif pro Einheit | Bis sechs Nachkommastellen, z. B. `0,001234 €/kWh`           |
| Energie           | `1.234,5 kWh`                                                |
| Volumen           | `1.234,5 m³`                                                 |
| Temperatur        | `21,5 °C`                                                    |
| Leistung          | `3,5 kW`                                                     |

`measurement()` setzt einen geschützten Abstand vor die Einheit. `unitLabel()` wandelt technische Schreibweisen wie `m3` in `m³` um. Datenbank- und API-Einheiten bleiben unverändert. Energie, Volumen, Leistung und Temperatur niemals gemeinsam aufsummieren. Die Formatierung ist keine Abrechnungsberechnung. Technische Eingabeformate und CSV/API-Verträge dürfen ausdrücklich einen Dezimalpunkt verlangen; diesen Unterschied an der Eingabe erklären.

## Zeitzonen und Zeiträume

Zeitpunkte werden intern in UTC verarbeitet. Die Präsentation verwendet eine validierte IANA-Zeitzone, standardmäßig `Europe/Berlin`. Die Benutzerwahl wird im Browsercookie `meterwerk_timezone` gespeichert und bereits beim Serverrendering berücksichtigt. Ungültige Präferenzen fallen auf die dokumentierte Anzeigevorgabe zurück. Es gibt bislang keine in PostgreSQL gespeicherte Tenant- oder Benutzerzeitzone und keinen geräteübergreifenden Abgleich dieser Präferenz.

Dashboard-Kontakte, Zähler- und Alarmlisten, Messwertdetails, Tarifhistorie, Erstellungszeitpunkte der Berichte und technische Konsolen zeigen lokale Zeitpunkte. Der Offset unterscheidet auch die doppelte Stunde bei der Rückstellung auf Winterzeit. Unit Tests prüfen Sommerzeitwechsel, Winterzeitwechsel und lokale Tageswechsel.

Bestehende Tages-/Monatsaggregate, Diagrammtage und gespeicherte Berichtsperioden behalten ihre UTC-Grenzen. Die Bezeichnungen nennen ausdrücklich **Berichtszeiträume UTC**. Ein Wechsel der Anzeigezeitzone ändert die Zahlen und Berichtsgrenzen nicht. Eine spätere Umstellung auf lokale Geschäftstage benötigt eine gemeinsame Anpassung von Aggregationen, Tarifabgrenzungen, Exporten und Tests.

Mit UTC beschriftete `datetime-local`-Eingaben werden explizit als UTC interpretiert. Insbesondere Zählerwechsel dürfen nicht von der Browserzeitzone abhängen. Das Ablaufdatum für Gateway-Credentials ist weiterhin ausdrücklich als lokale Browser-Eingabezeit beschriftet. API- und Exportzeitpunkte bleiben UTC.

## Hell, Dunkel, System

`meterwerk_theme` speichert ausschließlich `light`, `dark` oder `system` als nicht vertrauliche Browserpräferenz. Das Root-Layout liest den Cookie und setzt `data-theme`; System verwendet CSS `prefers-color-scheme`. Damit wird für das initiale Theme kein Inline-Startskript benötigt. Die Einstellung bleibt nach einem Reload erhalten.

Gemeinsame Farben werden über `--background`, `--surface`, `--foreground`, `--text-secondary`, `--border`, `--primary` und `--focus` definiert. Neue Komponenten verwenden diese Variablen statt fest eingebauter heller Flächen. Auf Hauptflächen liegen Textfarben oberhalb des AA-Mindestkontrasts von 4,5:1; konkrete Zustände werden zusätzlich im Browser geprüft. Akzentfarben in Diagrammen und Statusmarkierungen ersetzen niemals Textinformationen.

## Favoriten und zuletzt geöffnete Zähler

Zählerdetails bieten bis zu 20 persönliche Verknüpfungen, nach Favoriten und Aktualität geordnet. Sie liegen ausschließlich im `sessionStorage` des aktuellen Tabs, getrennt nach Benutzer und Mandant. Es werden nur Zähler-IDs und Favoritenflags gespeichert, keine Messwerte, Namen, Passwörter oder Sitzungstoken. Ein Löschbutton entfernt den Verlauf und die Favoriten; der aktuelle Zähler bleibt als zuletzt geöffnet sichtbar. Bei blockiertem Browserspeicher wird ein Fehlerzustand angezeigt.

Diese Verknüpfungen sind keine Berechtigungsquelle. Jeder Aufruf läuft erneut durch die bestehenden Serverprüfungen; entfernte oder nicht mehr freigegebene Zähler erscheinen nicht als Daten. Persistente Favoriten über mehrere Geräte und komfortable serverseitig autorisierte Bezeichnungen sind ein möglicher Folgeausbau.

## Filter in der URL

| Bereich             | Parameter             |
| ------------------- | --------------------- | --------- | ------------------------ | ----- | --- | ------------------- |
| Dashboard           | `days=7               | 30        | 90`, `type=ELECTRICITY   | WATER | GAS | HEAT`, `propertyId` |
| Gemeinsame Tabellen | `q` für die Suche     |
| Alarme              | `status=Offen         | Bestätigt | Erledigt`, leer für alle |
| Plattformverwaltung | explizites `tenantId` |

Dashboard-Filter und Medienlinks erhalten die übrigen Dashboard-Filter. Die Tabellen aktualisieren ihre rein lokalen Such-/Statusparameter mit der History-API, ohne bei jedem Tastendruck eine Serverabfrage auszulösen. Reload und geteilte Links stellen diese Filter wieder her. Sortierung und Tabellenseite bleiben lokale Bedienzustände. Filter auf gemeinsamen Tabellen gelten für die maximal 200 bereits autorisiert geladenen Einträge; dies ist keine vollständige Suche in beliebig großen Beständen.

Kundenparameter erteilen keine Rechte. Der Server bestimmt den Kundenmandanten aus der Sitzung. SUPER_ADMIN wird ohne Auswahl zur Kundenübersicht geleitet und wählt dort ausdrücklich einen Mandanten.

## Performance und Grenzen

Server Components bleiben Standard. Die neuen Client-Komponenten enthalten nur Interaktion; es wurde keine Chart-, Theme- oder Datenmanagement-Laufzeitbibliothek ergänzt. Playwright und axe sind reine Entwicklungsabhängigkeiten. Tabellen rendern 20 Zeilen pro Seite; die gemeinsame Datengrundlage bleibt auf 200 Datensätze begrenzt. Die Suche verwendet 180 ms Verzögerung und Request-Abbruch. Diagramme zeigen maximal 90 Tagespunkte. Automatische Aktualisierung pausiert bei unsichtbarem Tab.

Die vorhandenen Rohwertabfragen für Dashboard/Utility-Auswertungen und die serverseitige Portfolioaufbereitung sind noch keine Lösung für Millionenwerte oder große Mandanten. Hier sind Datenbankaggregate, serverseitige Cursor-Pagination und repräsentative Lasttests erforderlich. Kein stilles Abschneiden von Messwerten zur scheinbaren Beschleunigung einführen.

`pnpm exec tsx scripts/ux-performance.ts` misst gegen localhost mit vorhandenen Demo-Daten: drei warme HTTP-Läufe, Größe der initial referenzierten JS-Dateien und einen `EXPLAIN (ANALYZE, BUFFERS)` für die letzten 48 Messwerte. Der Test erzeugt und entfernt ausschließlich eine kurzlebige Testsitzung. Die JS-Gzip-Größe wird lokal errechnet; sie ist keine Messung des tatsächlichen Netztransfers oder der Interaktivität auf einem Mobilgerät. Aktuelle Ergebnisse stehen im [Verifikationsprotokoll](VERIFICATION.md).

Die CSP verwendet frische Script-Nonces pro Request; `unsafe-eval` ist nur im Entwicklungsmodus erlaubt. Inline-Style-Attribute für dynamische Diagramm-/Balkenbreiten werden gesondert zugelassen. Dynamisches Dateitracing für extern gespeicherte Anhänge ist an den dokumentierten `join()`-Argumenten ausgenommen; Anhänge müssen separat bereitgestellt werden, nicht im Serverbundle landen.

## Browser- und visuelle Regression

Voraussetzungen: migrierte lokale Demo-Datenbank, `SEED_DEMO=true`, vorhandenes `DEMO_PASSWORD`, lokaler Produktionsserver. Bestehende Passwörter nicht überschreiben und für diese Tests keine reale Hardware starten.

```sh
pnpm build
pnpm start
# in einem zweiten Terminal
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:visual
```

Unter Windows kann `PLAYWRIGHT_CHANNEL=msedge` für den installierten Edge gesetzt werden. Der dokumentierte lokale Lauf nutzt diese Alternative, weil der heruntergeladene Chromium-Prozess mit `spawn UNKNOWN` nicht startete. Die Produktionsprüfung vermeidet einen im Entwicklungsmodus beobachteten Next.js-Fehler bei der Performance-Zeitmessung.

Die Suite prüft Login, Navigation, Suche inklusive Ausfall, Dashboardfilter, Portfolio, Zähler, Dialogfokus, Favoriten, Gatewayübersicht, Berichtsübersicht, Alarmfilter, Fehlerseiten sowie Hell/Dunkel/System. Sie prüft Anzeige und Bedienung; sie schaltet keine Gateways, erzeugt keine Credentials und bestätigt keine realen Alarme. Berichterstellung/-export und alle Rollen-/Mandantengrenzen werden durch separate API-/Integrationstests ergänzt, soweit dort vorhanden; die Browserprüfung ist kein vollständiger Schreibworkflowtest.

Visuelle Referenzen für Login und die 503-Ansicht liegen unter `tests/browser/ux.spec.ts-snapshots/`, jeweils Desktop/Mobile und Hell/Dunkel. Screenshots sind bewusst auf stabile, nicht vertrauliche Seiten begrenzt. Bei beabsichtigten Designänderungen `pnpm test:visual --update-snapshots` ausführen, Bilder prüfen und anschließend ohne Update vergleichen. Baselines sind browser-/plattformabhängig. Ein neuer Browser benötigt eigene geprüfte Referenzen.

Playwright-Traces sind deaktiviert, damit eingegebene Passwörter und Sitzungen nicht versehentlich in Trace-Dateien landen. HTML-Reports und Fehlerartefakte liegen unter dem ignorierten `test-results/`. Abschließend Typecheck, ESLint, Prettier, Unit Tests, Integration, HTTP/API, Browser und Produktionsbuild sowie `git diff --check` ausführen.
