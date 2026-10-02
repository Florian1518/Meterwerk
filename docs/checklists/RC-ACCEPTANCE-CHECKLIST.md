# Release Candidate Acceptance Checklist

## Aktuell: finale lokale RC-Bewertung auf 1e6589e, 02.10.2026

**LOCAL SOFTWARE ACCEPTANCE: PASSED.**
**METERWERK V1.0 RC PREPARATION: READY.**
**LOCAL SOFTWARE RELEASE BLOCKER: NEIN.**

PASSED_LOCAL: Ausgang master/clean auf
`1e6589e2ee84eae787e444a0ab311fb1020853e6`; Web und Worker als
`meterwerk-web:rc-1e6589e` / `meterwerk-worker:rc-1e6589e` neu gebaut.
Worker Content/Secret Gate, Runtime 3/3, SIGTERM 3/3, Web Runtime 8/8,
Web-SIGTERM/Restart, finale imagegebundene SBOMs und gezielte Static-/Regression-Gates bestanden.
Lease-Recovery bei bytegleichen Bundles übernommen. Alle bisherigen lokalen
Softwareblocker ausdrücklich CLOSED. Breite App-/DB-/Browser-/Demo-, Recovery-
und Performance-Nachweise für unveränderte Pfade übernommen; kein Produktionslastnachweis.

EXTERNAL_VALIDATION_PENDING: echte CI auf finalem SHA, Staging/Promotion, Signing,
Provider, PITR/Full Restore, Produktions-HA/Failover und repräsentative Last.
HARDWARE_VALIDATION_PENDING: reale Strom-/Wasser-/Gas-/Wärmezähler, Gateways,
Modbus RTU/TCP, M-Bus, Wireless M-Bus, Pulse, LoRaWAN und Herstellergeräte.

Keine Production-Freigabe; kein Commit, Push, Tag oder Deployment. Der Commit
`Prepare Meterwerk v1.0 release candidate` ist nach Review empfohlen.
Die finalen Images bleiben dem bewerteten SHA zugeordnet. Secret-Scan-Scope:
gemergtes /app und ausgewählte Config-/History-Prüfungen, keine vollständige
Layerforensik. Web-Drain historisch 11,90 s; Shutdown-Fristen berücksichtigen.
Die Windows-Argon2-Hostbeschränkung ist kein Fehlschlag der geprüften Linux-Runtime.

Maßgeblich sind [finaler Bericht](../acceptance/FINAL-RC-1E6589E.md) und
[finale Evidence](../acceptance/FINAL-RC-1E6589E.json). Nachfolgende frühere Bewertungen
sind ausschließlich Historie und keine noch offenen aktuellen Blocker.

## Historische Prüfstände — durch obigen aktuellen Stand ergänzt

## Historisch: Container-Gate ab `5d8fc58`, 01.10.2026

**NICHT FREIGABEFÄHIG; kein finaler RC-Commit.** Softwarefix übernommen PASSED,
Linux-Daemon im bereits aktiven `desktop-linux` nicht erreichbar. Web-/Worker-
Build, Runtime, Shutdown/Lease-Recovery, Inspection, Image-Secrets und Image-SBOM:
NOT_EXECUTED / EXTERNAL_VALIDATION_PENDING. Keine Image-Digests vorhanden.
Neuer Performance-Lauf: FAILED vor den Messreihen (2 Dashboard-Warmups HTTP 500,
0 Samples); Windows Application Control blockiert Argon2. Alte Performancewerte
sind keine aktuellen Ergebnisse. Kein neu nachgewiesener Softwarefehler, aber
verpflichtende lokale Gates offen. CI: CONFIG_VERIFIED, nicht ausgeführt.
8/8 bestehende Artefakt-Prüfsummen und unveränderter Audit-Lockfile bestätigt.
Staging, Signing-Verifikation, Provider, HA/Restore und Hardware bleiben offen.
Details: [aktuelles Acceptance-Ergebnis](../acceptance/SOFTWARE-ACCEPTANCE-RESULT.md)
und [maschinenlesbare Evidence](../acceptance/CONTAINER-READINESS-5D8FC58.json).

## Historisch: Fortsetzung von `943d23f`, 01.10.2026

**NICHT FREIGABEFÄHIG.** Image-Gate-Korrekturen bestehen 5/5 gezielte Tests.
Keine verbleibenden bekannten Softwarefehler aus diesen Korrekturen; reale
Linux-Image-/Lifecycle-Abnahme weiterhin offen, weil der Daemon fehlt.
Signing, CI auf unveränderlichem SHA, Failover, Staging und finale RC-Acceptance
bleiben offen. Details: [Checkpoint-Fortsetzungsbericht](../acceptance/PHASE-5V-CHECKPOINT-943D23F.md).
Die bisherigen Tabellen bleiben historischer Nachweis, keine RC-Freigabe.

## Worker-Runtime-Fix ab WIP `edda867`

| Gate                                        | Stand                                                                                               | Nachweisgrenze                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Worker Build / Runtime                      | PASSED: 3 JS-Bundles, `pnpm install --prod`, `tsx` fehlt im 317-Paket-Produktionsabschluss          | Image-Runtime bleibt separat extern ausstehend                    |
| Statische Image-Prüfung                     | PASSED: 4 Stages, 3 Bundles, 0 Source Maps, keine ungefilterte Dev-Runtime-Dependency               | Kein Ersatz für einen tatsächlichen Image-Build                   |
| Web-/Worker-Image Build und Runtime         | `NOT_EXECUTED` — Docker 29.8.0 CLI vorhanden, Linux-Daemon unerreichbar                             | `EXTERNAL_VALIDATION_PENDING`; keine Digests/Image-SBOM behauptet |
| Standalone Runtime Smoke                    | PASSED 4/4: Liveness, Readiness, synthetischer Login, Dashboard                                     | Loopback, synthetische Testdatenbank                              |
| Provenance                                  | PASSED: Commit/Lockfile, Audit-Beleg, SBOM-Umfang, Plattform, Buildzeit und Prüfbefehl im Metadatum | Audit-Beleg referenziert SHA `4932f00`; echte Signatur fehlt      |
| Performance                                 | Vorhandener Messlauf 210 Requests, 0 Fehler                                                         | Lokale Testumgebung, keine Produktionskapazität                   |
| Failover / Staging / Signing / CI final-SHA | Offen                                                                                               | Externe Validierung erforderlich                                  |

Worker-Softwarefehler ist nach den lokalen Produktions-Build-, Bundle- und
statischen Abhängigkeitsprüfungen behoben. Docker CLI 29.8.0 ist vorhanden,
der Linux-Daemon jedoch nicht erreichbar; Images, Image-Runtime, Digest und
Image-SBOM bleiben `NOT_EXECUTED` / `EXTERNAL_VALIDATION_PENDING`. Kein
CI-Lauf auf dem späteren finalen Commit wurde ausgeführt.

## Historischer Fortsetzungsstand — WIP `a873a87`, 29.09.2026

WIP/HEAD bei Fortsetzung: `a873a87fbce94f2f8f547343e8347a1507c80ba0`, Branch `master`.
Kein finaler RC-Commit/Tag erzeugt.
Die leere Freigabevorlage und historischen Einträge unten sind keine aktuelle Freigabe.
Details und Beleggrenzen: [Fortsetzungsbericht](../acceptance/PHASE-5V-RESUME.md).

| Gate                           | Aktueller Nachweis                                                                      | Verbleibende Grenze                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Demo-Szenariowirkungen         | PASSED: vorhandene 13 Szenarien / 266 DB-/HTTP-Checks; neu 2 Browserprojekte            | Keine Hardware-/Providerzustellung                                                                              |
| Clean Install / Upgrade        | PASSED: 47 clean; offizieller Tag 7→47; ergänzend 39→47, 19 Tabellen, 127 FKs, 6 Smokes | Nicht getaggte interne/dev-Historien sind nicht Teil der v1.0-Supportgrenze                                     |
| Unterstützte DB-Baseline       | PASSED: v1.0 canonical 47; Upgrade `v0.4b-pilot-ready` 7→47                             | Nicht getaggte interne/dev-Basen mit unbekannter History ausdrücklich nicht unterstützt                         |
| Unit / DB / Integration / HTTP | PASSED laut vorhandenen Logs                                                            | 285 Unit, 24 DB, 9 Field-DB, 18 Auth-, 8 Import-, 6 Quality-, 7 Rules-, 84 HTTP-Checks; nicht erneut ausgeführt |
| Produktpfade / PWA             | PASSED im dokumentierten Umfang                                                         | 44 vorhandene HTTP-/DB-Checks und 2 PWA-Browserfälle; zusätzlich 1 echte mobile Field-Service-Journey           |
| Prisma / Types / Build         | PASSED: Prisma 7.10.0 Generate und Production Build auf `a873a87`                       | Frischer Build: Next.js 16.3.5, 69 Seiten                                                                       |
| Dependency Audit               | PASSED: `pnpm audit --json`, pnpm 12.5.1, Exit 0, 0 Advisories                          | Beleg mit SHA/Lockfile-Provenance: [Audit-Report](../acceptance/DEPENDENCY-AUDIT-4932F00.json)                  |
| Performance                    | PASSED: Gate jetzt auf vorhandenen Messwerten ausgewertet                               | 7×30 sequenzielle lokale Messungen, Worker-Queues leer; keine Kapazitäts-/Failoverabnahme                       |
| Kapazität / Failover           | EXTERNAL_VALIDATION_PENDING                                                             | Lokale sequenzielle Regression ersetzt keine produktionsähnliche Last- oder Failoverabnahme                     |
| Transitive SBOM                | PASSED: 750 gelockte Komponenten, 751 Graphknoten                                       | Lockfile-SBOM einschließlich Dev-/Optional-Abhängigkeiten, keine Container-OS-SBOM                              |
| Lokale Artefakte               | PASSED auf `a873a87`: Production Build, SBOM, Verifier, 4/4 Runtime-Smokes              | Windows-x64 only; siehe [Artefaktnachweis](../acceptance/RELEASE-ARTIFACT-A873A87.json)                         |
| Worker-Image Runtime           | RELEASE_BLOCKER                                                                         | `tsx` aus Dev-Dependencies wird zur Laufzeit genutzt; komplettes `node_modules` wird kopiert                    |
| Images / Image-SBOM            | NOT_EXECUTED                                                                            | Docker CLI vorhanden, lokaler Linux-Daemon nicht erreichbar                                                     |
| CI-Konfiguration               | CONFIG_VERIFIED                                                                         | Actions/Permissions/Lockfile statisch geprüft; Docs-Gate/Artefakt-Verifier fehlen; CI selbst nicht gelaufen     |
| Staging / unveränderlicher SHA | EXTERNAL_VALIDATION_PENDING                                                             | Kein Git-Remote; keine GitHub-Actions-Ausführung oder Staging-Umgebung                                          |
| Signing                        | SIGNING_PREPARED_NOT_VERIFIED                                                           | Metadaten/SBOM/Checksummen vorhanden; keine echte Signatur oder Verifikation                                    |
| Provider / PITR / Restore      | EXTERNAL_VALIDATION_PENDING                                                             | Kein externer Provider, PITR- oder vollständiger Restore-Drill in dieser lokalen Prüfung                        |
| Hardware                       | HARDWARE_VALIDATION_PENDING                                                             | Keine reale Hardware verbunden                                                                                  |

**Entscheidung: NICHT FREIGABEFÄHIG.** Migrations- und Dependency-Audit-Gates
sind für die dokumentierte Supportgrenze geschlossen. Worker-Image-Runtime ist
ein offener Software-Release-Blocker; Images, Signing, CI/Staging und weitere
oben ausgewiesene Release-Gates sind nicht abgeschlossen.

## Freigabevorlage

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
