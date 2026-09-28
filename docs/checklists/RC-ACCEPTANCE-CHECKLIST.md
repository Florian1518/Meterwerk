# Release Candidate Acceptance Checklist

RC version: \***\*\_\_\*\*** Git SHA: \***\*\_\_\*\*** Environment: \***\*\_\_\*\*** Date: \***\*\_\_\*\***

Mark each item `PASSED`, `FAILED`, `NOT_EXECUTED`, `EXTERNAL_VALIDATION_PENDING` or `HARDWARE_VALIDATION_PENDING`. Attach evidence or finding reference; do not treat unchecked/unknown as passed.

## Source and build

- [ ] Git working tree clean; tag/SHA and package version recorded
- [ ] CI green for exact SHA
- [ ] Prisma validate and generate
- [ ] Migration inventory and clean-install / upgrade path checked on isolated test DB
- [ ] Unit tests
- [ ] Integration and Tenant-Isolation tests
- [ ] HTTP/API tests
- [ ] Browser/E2E tests
- [ ] Production build
- [ ] Release artifact metadata, SBOM, signing status documented

## Security and dependencies

- [ ] Auth/MFA, CSRF, injection, XSS, SSRF, uploads, API keys and webhook regressions
- [ ] SUPER_ADMIN and Cross-Tenant authorization tests
- [ ] Secret scan
- [ ] Dependency audit and lockfile review
- [ ] CI permissions/action pins and artifact contents checked
- [ ] Known findings and limitations reviewed

## Product acceptance

- [ ] Metering across four media, units, aggregation, costs and exports
- [ ] Connectivity software tests; hardware status separately recorded
- [ ] Analytics, forecast, rules, alarms, reports
- [ ] WorkOrders, attachments, device/fleet and support flows
- [ ] Public API and webhook delivery/error paths
- [ ] Demo seed/scenarios/guards; Production reset blocked
- [ ] PWA/mobile and cache/offline behavior

## Operations and release

- [ ] Liveness/readiness/build info and worker/queue status
- [ ] Backup verification, restore guards, DR status
- [ ] Staging deployment and smoke/E2E acceptance
- [ ] External storage/mail/MQTT/monitoring tests, if required
- [ ] PITR/restore drill status recorded; no theoretical test marked passed
- [ ] Rollback and migration compatibility reviewed
- [ ] Release notes/changelog updated
- [ ] No production deploy without explicit approval

## Findings and decision

- Release blockers: \***\*\_\_\*\***
- Major/minor findings: \***\*\_\_\*\***
- External validation pending: \***\*\_\_\*\***
- Hardware validation pending: \***\*\_\_\*\***
- Decision / approver role: \***\*\_\_\*\***

## Phase 5v Teil 2 — Status am 28.09.2026

Baseline/HEAD: `09427c6b74c1ae3cb4355fa51ac3e6c531f1045e`; Arbeitsbaum uncommitted, kein RC-Tag.

| Bereich                                            | Status                      | Beleg / offene Grenze                                                                                  |
| -------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Prisma validate/generate                           | PASSED                      | Teil-2-Log; Prisma 7.10.0                                                                              |
| PostgreSQL Clean Install                           | PASSED                      | isolierte Test-DB, 46 Migrationen                                                                      |
| PostgreSQL Upgrade                                 | PASSED                      | synthetischer Stand 39 → 46; 17 Tabellen geprüft                                                       |
| Relationale Integrität / Tenant-FKs                | PASSED                      | DB-Acceptance 24/24; Field DB 9/9                                                                      |
| Typecheck / ESLint / Prettier / `git diff --check` | PASSED                      | finale Prüfungen Exit 0; Prettier ohne Formatierungsfehler                                             |
| Unit Suite                                         | PASSED                      | 39/39 Dateien, 285/285 Tests                                                                           |
| Security Unit Suite                                | PASSED                      | 6/6 Dateien, 63/63 Tests                                                                               |
| Security DB Integration                            | PASSED                      | MFA, Recovery Codes, Reset Replay, Invitation Replay                                                   |
| Auth/Password Integration                          | PASSED                      | 18/18 Integration Checks; Argon2id hash/verify eingeschlossen                                          |
| HTTP/API                                           | PASSED                      | 84 Checks gegen laufende lokale Production-App                                                         |
| Browser Login-/Produktjourney                      | PASSED                      | 4/4 Projekte; zusammen mit den zuvor bestandenen 24 Fällen 28/28 über zwei Läufe                       |
| Production Build                                   | PASSED                      | lokaler Next Build Exit 0; 69 statische Seiten                                                         |
| Demo Seed/Verify                                   | PASSED                      | Reset/Seed/Verify auf isolierter Test-DB; genaue Bestandszahlen im Acceptance Result                   |
| Production Reset-/Seed-Schutz                      | PASSED                      | 2/2 Guards verweigerten Production-Ausführung                                                          |
| Secret Scan                                        | PASSED                      | 0 Review-Funde; 17 bekannte Demo-/Template-Werte                                                       |
| Dependency Audit                                   | NOT_EXECUTED                | pnpm-native.exe startet nicht (`spawnSync ... UNKNOWN`); keine Vulnerability-Findings daraus ableitbar |
| CI                                                 | NOT_EXECUTED                | Workflow nur statisch geprüft; keine GitHub-Actions-Ausführung für einen RC-SHA                        |
| Release Images / transitive SBOM / Signing         | NOT_EXECUTED                | keine Images gebaut; SBOM nur direkte Abhängigkeiten, Signierung nicht konfiguriert                    |
| Performance Gate                                   | NOT_EXECUTED                | keine belastbare Messung                                                                               |
| Demo Szenarioeffekte                               | FAILED                      | Szenarien persistieren Auswahl/Metadaten, erzeugen noch keine szenariospezifischen Produktzustände     |
| Bestandsmigration-Kompatibilität                   | NOT_EXECUTED                | lokale Clean Install/39→46 bestanden; Migrationshistorie unterstützter Bestands-DBs noch abzugleichen  |
| Provider-Validierung                               | EXTERNAL_VALIDATION_PENDING | Malware Scanner, echte externe Provider, Staging, PITR/Provider-Restore                                |
| Hardware                                           | HARDWARE_VALIDATION_PENDING | physische Geräte nicht angeschlossen oder getestet                                                     |

**Offene Release-Blocker:** Demo-Szenarioeffekte; sichere Migrationshistorie für unterstützte Bestandsdatenbanken muss vor RC verifiziert werden. **Release-Gate zusätzlich nicht geklärt:** Dependency Audit. Siehe [Acceptance Result](../acceptance/SOFTWARE-ACCEPTANCE-RESULT.md) und [Known Limitations](../KNOWN-LIMITATIONS.md).

## Phase 5v Teil 3 Nachprüfung (28.09.2026)

| Gate                                         | Status                            | Ergebnis                                                                                                                 |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Demo Apply/DB/API/UI/Audit/Reset je Szenario | FAILED                            | Engine speichert weiter nur Auswahl-/Audit-Metadaten; alle 13 Produktwirkungen offen                                     |
| Historische Migrationen 008/009              | FAILED                            | SQL-Ursprung und Checksummen dokumentiert; kein verifizierter Pfad für DBs mit Originalchecksummen; kein History-Rewrite |
| Clean Install / 39→46                        | PASSED (Teil 2, nicht wiederholt) | 46 Migrationen; Teil-2-Ergebnis bleibt unverändert; deckt geänderte Bestandschecksummen nicht ab                         |
| Dependency Audit                             | NOT_EXECUTED                      | pnpm 12.5.1 Native-Executable durch Windows Application Control blockiert                                                |
| Performance Gate                             | NOT_EXECUTED                      | Fixture erstellt nur Metadaten, keine Messungen; Regression-Gate nicht ausführbar ohne Resultatdatei                     |
| Transitive SBOM / Images / Checksummen       | NOT_EXECUTED                      | bestehende SBOM enthält direkte Dependencies mit Versionsbereichen; Docker nicht verfügbar                               |
| Signing                                      | NOT_EXECUTED                      | keine produktive/testweise Signing-Identität konfiguriert                                                                |
| Staging / CI                                 | EXTERNAL_VALIDATION_PENDING       | Staging nicht verfügbar; Actions nur statisch geprüft, nicht ausgeführt                                                  |
| Physische Geräte                             | HARDWARE_VALIDATION_PENDING       | keine Hardware angebunden                                                                                                |

**RC-Gate:** NICHT FREIGABEFÄHIG. Zwei RELEASE_BLOCKER und das offene Dependency-Audit-Gate bleiben bestehen. Teil-2-Testzahlen wurden in Teil 3 nicht erneut ausgeführt.
