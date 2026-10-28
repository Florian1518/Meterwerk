# Meterwerk 1.0.0-rc.7 – lokale Release-Abnahme

## Herkunft und Umfang

- Ausgangspunkt: tatsächlicher Staging-RC5 `305580eb2f214bd867030545f0180bc8dbcb224f`.
- Gemeinsamer Vorfahr von RC5 und Pricing/RC6: `ca3773b587543fa93aed7a946a61c8a1d564ddab`.
- Pricing: `1042732ec0c37d2d80af38cd41dce9e0425fba88`; dieser Commit ist direkter Parent von RC6 und kein Nachfahre des angegebenen RC5.
- Pricing-Cherry-Pick auf RC5: `6727dc4`. Einziger Konflikt: additive README-Abschnitte; beide erhalten. Prisma-Schema automatisch zusammengeführt, beide Gateway-/Modbus-Erweiterungen erhalten.
- Historischer RC6: Version `1.0.0-rc.6`, SHA `331009a92fa06173133d8db28273355c648a7889`, lokal bestanden, wegen divergierender Staging-Migrationshistorie nicht deploybar und nicht deployed. Der RC6-Worktree bleibt unverändert.
- Separater Worktree `.local/rc7`, Branch `release/v1.0.0-rc.7`. Kein Deployment, Staging-/Produktionszugriff, Git-Tag oder Registry-Push.

Die Staging-Zuordnung und 49 abgeschlossenen Migrationen stammen aus dem Auftrag. Der Nachweis rekonstruiert diesen Commit lokal; er behauptet keine erneute Live-Abfrage von Staging.

## Additive Migration und Security-Übernahme

Alle 49 RC5-Migrationsdateien und `migration_lock.toml` bleiben inhaltlich unverändert. Erhalten bleiben insbesondere `202610190001_gateway_provisioning_foundation` und `202610220001_modbus_commissioning_evidence`. Einzige neue Migration ist `202610260001_saas_pricing`; Gesamtzahl: **50**.

RC6 wurde nicht vollständig cherry-gepickt. Übernommen wurden Next.js/eslint-config-next 16.4.1, Vitest 4.1.12, Zod 4.6.6 sowie fast-uri 3.1.9 und ip-address 10.7.4 als Overrides, die dynamische Migrationsprüfung im älteren Upgrade-Runner und der CRLF/LF-robuste Compose-Policytest. Die bereits in RC5 vorhandenen Migrationshelfer und isolierten Benutzer-Fixtures blieben erhalten; der User-Management-Runner prüft jetzt alle vier Browser-Profile. Die Lockdatei wurde aus RC5 fortgeschrieben, einschließlich dessen Vite-8.3.4-Fix. Keine RC6-Versionsmetadaten übernommen.

## Migrationsnachweis

`scripts/acceptance-rc7-lineage.mjs` verlangt eine neue, leere Loopback-Acceptance-Datenbank. Es extrahiert RC5-Migrationen und Schema direkt aus Git, wendet genau 49 Migrationen an und vergleicht die abgeschlossene Historie einschließlich SHA-256-Checksums mit den Git-Blobs. Es prüft RC5-Schema-Drift, wendet danach ausschließlich Pricing an und prüft 50 abgeschlossene Migrationen, unveränderte historische Historieneinträge, unveränderte Gateway-/Modbus-/Device-Spalten, Constraints und Indizes sowie die vier neuen Pricing-Felder und Decimal-Präzision. Abschließend: Migrationsstatus aktuell und kein Schema-Diff. Fresh Install mit 50 Migrationen ist ebenfalls driftfrei.

## Prüfstand

Die abschließenden Ergebnisse und Image-IDs werden nach Abschluss aller lokalen Gates dokumentiert. Maschinenlesbare Logs, Testdatenbanken und Image-Nachweise bleiben unter `.local/` und werden nicht committet. Der finale SHA wird nach dem Release-Commit außerhalb des Commits dokumentiert; finale Images werden mit exakt diesem SHA gebaut und erneut geprüft.
