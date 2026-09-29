# Meterwerk v1.0 canonical database baseline

Entscheidung: 29.09.2026, geprüft auf Commit `4932f0087cf263988c599e498ac682fac1d93f5c`.
Die Baseline ist festgelegt; dies ist keine RC-Freigabe.

## Nachweisbarer Projektstand

Das Repository hat keinen konfigurierten Remote und genau einen versionierten
Tag: `v0.4b-pilot-ready` auf `a5b3011` (18.09.2026). Dieser dokumentierte
Pilot-Ausgangspunkt enthält sieben Migrationen (`202609170001` bis
`202609180004`); Dashboard-Migrationen 008/009 sind nicht darin enthalten.
Sie wurden erst am 23.09.2026 im nicht getaggten Entwicklungscommit `9b8c485`
hinzugefügt. Es gibt keinen versionierten Release oder dokumentierten
Supportvertrag für einen Zwischenstand, der die Originaldateien enthält.

Damit gilt **Fall A für die offiziell versionierte Supportgrenze**: Es gibt
keine belegte, offiziell versionierte externe/geteilte Datenbankbaseline, die
008/009 mit den Originalchecksummen registriert haben könnte. Daraus folgt
nicht, dass niemals jemand einen ungetaggten Entwicklungsstand betrieben hat.
Solche nicht versionierten internen/dev Datenbanken sind ausdrücklich keine
unterstützte v1.0-Upgradebaseline; ihr Zustand wird nicht automatisch
übernommen.

Die **Meterwerk v1.0 canonical database baseline** ist die aktuelle vollständige
47-Migrations-History. Unterstützter Upgradeursprung ist der dokumentierte Tag
`v0.4b-pilot-ready` mit sieben Migrationen. Installationen können außerdem neu
auf einer leeren Datenbank beginnen. Interne/dev Datenbanken, die nach dem Tag
entstanden sind oder unbekannte/abweichende Checksummen aufweisen, benötigen
eine ausdrücklich geprüfte Datenübernahme oder Neuaufsetzung aus exportierten
Daten. Der Preflight verweigert sie unverändert und ohne History-Manipulation.

## Ursache und Checksummen

| Migration                         | Original SHA-256                                                   | Aktuelle kanonische LF-Fassung SHA-256                             |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `202609240008_dashboards`         | `234edfd015d1a790bf1e2676bf1296ddb852420664e0ad9e713739eb8d61b171` | `a650d334c72979b1b0d5c30cce1fc2b302c768b6a2aa75e92b6d62f405857b4a` |
| `202609240009_dashboard_recovery` | `4e5cb60b86fcb463ba1dcfa940408622ac04e41a60c0ade98d2d60c364c7bc23` | `2e4ae9a39d6d5de3f721c3739c73db7983a1ae23f18a3b3e3467a1ebbf6776b6` |

008 legt mit der UNIQUE-Tabellenconstraint bereits den Index
`Dashboard_id_tenantId_key` an und versucht anschließend denselben Index erneut
anzulegen. PostgreSQL meldet `42P07` (`duplicate_table`). Die aktuelle Fassung
verwendet `CREATE UNIQUE INDEX IF NOT EXISTS`.

009 versucht die vorhandene Constraint erneut anzulegen. Der historische Handler
fängt `duplicate_object`, aber nicht den tatsächlich auftretenden Fehler `42P07`.
Die aktuelle Fassung prüft die Constraint in `pg_constraint` vor dem Anlegen.
Beide ursprünglichen Fehler wurden mit echtem PostgreSQL in temporären,
vollständig zurückgerollten Schemas reproduziert. Keine Migrationstabelle wurde
dabei geändert.

Prisma speichert die Dateichecksum in `_prisma_migrations`. Ein erfolgreiches
`migrate deploy` allein belegt nicht die Gleichheit früher angewandter Dateien;
der zusätzliche Preflight prüft deshalb jeden registrierten aktiven Eintrag
gegen die Repository-Datei (einschließlich äquivalenter LF/CRLF-Zeilenenden).
Fehlgeschlagene, unbekannte und abweichende Migrationen stoppen den Pfad.
Insbesondere Original-008/009 werden nicht still akzeptiert oder umregistriert.

Direkt abhängig sind 009 (Recovery), `202609240010_dashboard_filters`
(DashboardWidget.filters) und `202609280001_acceptance_schema_alignment`
(Dashboard.roles). Alle späteren Migrationen benötigen einen erfolgreich
abgeschlossenen vorangehenden Prisma-Deploy-Pfad. Ein späterer Forward-Fix kann
eine vorher abbrechende 008 bei einer leeren Installation nicht reparieren.

## Getestete Baselines und sichere Strategie

1. **Clean Install:** leere isolierte PostgreSQL-17.10-Datenbank, alle 47
   Migrationen, Prisma-Seed und Demo-Verify erfolgreich; App-Start, Liveness,
   Readiness und Login-Seite geprüft (6/6 HTTP-Smokes über Clean- und Upgrade-DB).
2. **Unterstütztes Upgrade:** die tatsächlichen sieben Migrationen aus
   `v0.4b-pilot-ready` wurden aus Git angewendet, anschließend sieben synthetische
   Datensätze aus Tenant, User, Property, Building, Unit, Meter und Reading
   angelegt und mit dem aktuellen Stand auf 47 Migrationen aktualisiert.
   Alle sieben Datenbereiche blieben bitwertgleich; sieben alte
   `_prisma_migrations`-Zeilen blieben unverändert. Die neuen 008/009-Zeilen
   haben die Prüfsummen der korrigierten kanonischen Dateien. Prisma Validate,
   Schema-Diff ohne Drift sowie App-Start, Liveness, Readiness und Login-Seite
   bestanden. Der bereinigte [Upgradebeleg](acceptance/SUPPORTED-UPGRADE-V0.4B-4932F00.json)
   enthält die konkreten Prüfergebnisse.
3. **Zusätzlicher kanonischer Upgradebeleg:** der bereits ausgeführte
   synthetische 39→47-Pfad erhielt dieselben Datensätze in 19 Tabellen,
   validierte 127 Fremdschlüssel, Cross-Tenant-Abweisungen und Prisma-Diff ohne
   Drift. Er ist ergänzende Regression, nicht die definierte Release-Ursprungsbaseline.

### Release-Entscheidung zu 008/009

Die Originalchecksummen sind aus Commit `9b8c485` rekonstruiert; die aktuellen
kanonischen LF-Prüfsummen stehen in der Tabelle oben. Migration 008 legte den
Unique-Index bereits durch die `UNIQUE`-Tabellenconstraint an und versuchte,
denselben Namen erneut anzulegen (PostgreSQL `42P07`). Migration 009 fing
`duplicate_object`, nicht den reproduzierten `42P07`-Konflikt beim erneuten
Anlegen. Die Korrekturen sind für Clean Install erforderlich.

Der dokumentierte und getestete v0.4b-Supportursprung enthält beide Migrationen
nicht; sie werden beim Upgrade aus den aktuellen korrigierten Dateien erstmalig
angewendet. Die reale Upgradeprüfung bestätigt, dass weder alte Historieneinträge
geändert noch Originalchecksummen künstlich eingetragen werden.

Folglich ist der Migrations-RELEASE_BLOCKER für die definierte v1.0-Supportgrenze
geschlossen. Datenbanken mit originalen 008/009-Checksummen sind nicht Teil dieser
Grenze und werden vom Preflight gestoppt. Es wurde keine `_prisma_migrations`-
Tabelle manuell verändert, kein `migrate resolve` und kein `db push` verwendet.

## Reproduktion

`pnpm db:migrate` führt vor Prisma den lesenden
`scripts/verify-migration-baseline.mjs` aus. Direktes Umgehen dieses Preflights
ist kein freigegebener Upgradeprozess.

Lokale Abnahme: `node scripts/acceptance-local.mjs db`, anschließend
`node scripts/acceptance-local.mjs run rc-databases scripts/acceptance-rc-databases.mjs`.
Der Erzeuger verweigert bereits existierende RC-Datenbanken ausdrücklich.
Clean Install über Modus `cleanrc`, Upgrade über Modus `upgraderc` und
`scripts/acceptance-database.mjs`; offizieller v0.4b→47-Test über
`node scripts/acceptance-local.mjs run pilot-upgrade scripts/acceptance-supported-upgrade.mjs`.
Historische SQL-Proben über
`scripts/migration-history-report.mjs` im Modus `run`.
Private Konfiguration und vollständige lokale Logs liegen ausschließlich unter
`.local/acceptance/` und gehören nicht ins Repository.
