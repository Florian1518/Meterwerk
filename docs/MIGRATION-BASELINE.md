# Datenbank-Baseline für die v1.0-Vorbereitung

Stand: 28.09.2026, Arbeitsstand auf WIP `e88b1de`. Dies ist keine RC-Freigabe.

## Nachweisbarer Projektstand

Das Repository hat keinen konfigurierten Remote. Der vorhandene Tag
`v0.4b-pilot-ready` zeigt auf `a5b3011`; dort existieren die Dashboard-Migrationen
008/009 noch nicht. Beide Dateien stammen aus `9b8c485`. Ihre korrigierten
Fassungen sind bereits Bestandteil des übernommenen WIP-Commits `e88b1de` und
wurden in dieser Fortsetzung nicht erneut geändert.

Diese Git-Belege beweisen **nicht**, dass außerhalb des Repositorys keine
unterstützte/geteilte Installation existiert. Die entsprechende Betriebsfrage
ist offen. Fall A (keine unterstützte externe Installation mit Originalhistorie)
ist deshalb noch nicht bestätigt. Keine unbekannte Datenbank wird als
kompatibel deklariert. Dieser Punkt bleibt ein RELEASE_BLOCKER.

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

1. Leere isolierte PostgreSQL-17.10-Datenbank: 47 aktuelle Migrationen,
   Prisma-Seed und Demo-Verify erfolgreich; App-Start, Liveness, Readiness und
   Login-Seite geprüft.
2. Definierter synthetischer kanonischer Stand mit 39 Migrationen bis
   `202609240020_scaling_performance`: Upgrade auf 47, identische Daten in
   19 Tabellen einschließlich Tenant, Dashboard und DashboardWidget;
   validierte Fremdschlüssel, Cross-Tenant-Abweisungen und Prisma-Diff ohne Drift.
   App-Start, Liveness, Readiness und Login-Seite geprüft.
3. Lokale WIP-Acceptance-DB mit 46 kanonischen Migrationen: neue 47. Migration
   angewendet; Produkt-/HTTP-Abnahme gegen diese DB bestanden.

Der v1.0-Supportumfang kann auf diese kanonische pre-v1.0-Baseline festgelegt
werden, **sobald** Fall A bestätigt ist. Bis dahin handelt es sich um den
technisch getesteten Umfang, nicht um eine Entscheidung über externe
Supportverpflichtungen. Die 39-Migrations-Baseline enthält bereits die
korrigierten 008/009; sie ist kein Originalhistorien-Test.

Bei Fall B: Datenbank unverändert sichern und ihre registrierte Historie sowie
das tatsächliche Schema lesend inventarisieren. Erst danach einen separaten
Forward-/Upgradepfad gegen eine isolierte Kopie implementieren und abnehmen.
Es gibt hier keinen getesteten pauschalen Upgradepfad für Originalchecksummen.
Keine Manipulation von `_prisma_migrations`, kein kaschierendes `migrate resolve`,
kein `db push`, kein Reset einer Bestandsdatenbank.

## Reproduktion

`pnpm db:migrate` führt vor Prisma den lesenden
`scripts/verify-migration-baseline.mjs` aus. Direktes Umgehen dieses Preflights
ist kein freigegebener Upgradeprozess.

Lokale Abnahme: `node scripts/acceptance-local.mjs db`, anschließend
`node scripts/acceptance-local.mjs run rc-databases scripts/acceptance-rc-databases.mjs`.
Der Erzeuger verweigert bereits existierende RC-Datenbanken ausdrücklich.
Clean Install über Modus `cleanrc`, Upgrade über Modus `upgraderc` und
`scripts/acceptance-database.mjs`; historische SQL-Proben über
`scripts/migration-history-report.mjs` im Modus `run`.
Private Konfiguration und vollständige lokale Logs liegen ausschließlich unter
`.local/acceptance/` und gehören nicht ins Repository.
