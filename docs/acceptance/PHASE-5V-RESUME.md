# Phase 5v — Fortsetzung auf e88b1de

Stand: 29.09.2026. **Keine RC-Freigabe, kein RC-Commit, kein Tag.**

## Rekonstruktion des Unterbrechungspunkts

`git status`, `git log -5 --oneline` und `git show --stat e88b1de` bestätigten
`master` auf `e88b1de65364ab606dc848ccf652acd85b9f49a4`. Entgegen dem zuletzt
gesicherten Clean-Zustand lagen bei Beginn bereits 14 modifizierte und 12 neue
Dateien vor. Diese wurden übernommen, nicht zurückgesetzt.

Der Commit enthält Teil 2 und die lesende Teil-3-Nachprüfung. Die uncommittierten
Dateien und lokalen Logs enthalten eine weitere Fortsetzung vom 28.09.2026.
Der letzte erfolgreiche lokale Prüfbeleg ist `rc-final-build.json`, beendet um
12:56:15 UTC (14:56:15 Europe/Berlin). Das Release-Verpackungsskript wurde kurz
davor bearbeitet; ein entsprechender neuer Verpackungslauf fehlte. SBOM,
Szenario-, Migrations-, Performance- und Produktpfadarbeiten waren bereits weiter
als in den vier zentralen Acceptance-Dokumenten beschrieben.

**Belegbarer Stand:** nach finalem lokalen Build, vor nachgewiesener
Artefaktverpackung und Zusammenführung der Acceptance-Dokumentation. Die genaue
letzte Chat-/Toolaktion und der vollständige frühere Phase-5v-Prompt liegen nicht
im Repository vor; eine exaktere Behauptung wäre nicht durch Artefakte gedeckt.

## Bereits in e88b1de abgeschlossen

- Prisma-/Schema- und Tenant-FK-Korrekturen, erweiterter synthetischer Demo-Seed,
  isolierter Acceptance-Runner sowie korrigierte CI-/Docker-Vorbereitung.
- Dokumentiert: Clean Install 46 Migrationen; kanonischer Upgradepfad 39→46 mit
  Datenerhalt in 17 Tabellen; DB-Acceptance 24/24 und Field-DB 9/9.
- Unit 285/285, Security Unit 63/63, Auth-Integration 18 Checks,
  Security-Integration (MFA/Recovery/Reset-/Invitation-Replay), HTTP 84 Checks.
- Browser: 24 frühere Fälle und vier erfolgreiche Login-Journeys über getrennte
  Läufe; kein behaupteter gemeinsamer 28er-Neulauf.
- Prisma validate/generate, Typecheck, Lint, Format, Production Build,
  Secret Scan und Dokumentationsprüfungen bestanden laut Teil-2-Belegen.
- Teil 3 analysierte Originalchecksummen 008/009, aber implementierte keine
  Szenariowirkungen, kein Performance-Gate und keine transitive SBOM.

Diese alten Prüfungen wurden bei der Wiederaufnahme nicht erneut ausgeführt.

## Bereits vorhandene uncommittierte Fortsetzung

| Bereich             | Tatsächlicher lokaler Beleg vom 28.09.2026                                                                                             | Bewertung                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Szenarioengine      | `rc-scenarios`: 13 Szenarien, 266 Checks, Exit 0                                                                                       | Persistierte Produktwirkungen, Tenant-/Grant-/Rollenprüfung, Audit, Reset; keine Hardware                            |
| Migrationsbaseline  | `rc-clean`, `rc-upgrade`, `database-results`, `database-health`                                                                        | 47 Migrationen; Upgrade 39→47; 19 Tabellen erhalten, 127 FKs, 6 Startup-/Health-Prüfungen                            |
| Historienanalyse    | `rc-history-complete`, `migration-history`                                                                                             | Original-008 und -009 reproduzierbar Fehler 42P07; keine Historienmanipulation                                       |
| Preflight           | `rc-baseline-clean`, `rc-baseline-upgrade`                                                                                             | Kanonische angewandte Checksummen geprüft; keine fremde Bestandsinstallation                                         |
| Dependency Audit    | `dependency-audit.json`                                                                                                                | Null Advisories für 765 gemeldete Dependencies; Aufruf, Exit und Lockfile-Hash fehlen im Report                      |
| Performance-Messung | `rc-performance`, `performance-results`                                                                                                | 7 Komponenten × 30 Messungen, keine Fehler; sequenziell, lokal, leere Worker-Queues                                  |
| Produktpfade        | `rc-product-adapter`, `product-path-results`                                                                                           | 44 Checks: Alarmstatus, Analytics/Grants, Device-Rotation/Queue/Testadapter, Operations, Attachment-/Testscannerpfad |
| PWA                 | `rc-pwa`                                                                                                                               | 2/2 Desktop/Mobil: Manifest, Service Worker, Offline/Reconnect, Navigation                                           |
| Regression          | `rc-unit`, `rc-db-services-retry`, `rc-field-db-correct`                                                                               | 285 Unit, 24 DB-Acceptance, 9 Field-DB bestanden                                                                     |
| Integration         | `rc-auth-integration`, `rc-import-integration`, `rc-quality-integration`, `rc-rules-integration`, `rc-security-integration`, `rc-http` | 18 Auth-, 8 Import-, 6 Quality-, 7 Rules-, 84 HTTP-Checks; Security-Integration bestanden                            |
| Qualität            | `scenario-validate`, `scenario-generate`, `rc-lint`, `rc-final-types`, `rc-final-build`                                                | Je Exit 0; finaler Build bereits vorhanden                                                                           |
| SBOM                | Vorhandene generierte CycloneDX-Datei und neues Script                                                                                 | Transitive Umsetzung vorhanden; Wurzelreferenz und abschließende Verifikation ergänzt                                |
| Release-Paket       | Neues Verpackungsskript, bisher nur alte Metadaten                                                                                     | Teilweise implementiert, Ausführung fehlte                                                                           |

Die Logs `rc-build`/`rc-build-final`, `rc-db-services` und `rc-field-db` sind
fehlgeschlagene Zwischenläufe. Die Tabelle verweist bewusst auf spätere
erfolgreiche Belege und verschweigt die früheren Fehlschläge nicht. Kein Erfolg
wird allein aus Dateinamen oder Implementierungsabsicht abgeleitet.

## In dieser Wiederaufnahme ergänzt

- Performance-Regressionsgate auf der bestehenden Messdatei ausgeführt: PASSED.
  p95 in ms: Dashboard 318,01; Readings 20,69; Analytics 35,67; Public API 34,42;
  Fleet 49,51; QueueClaim 1,67; Worker 4,40. Keine neue Lastmessung.
- Fehlende Demo-Browserabnahme: 2/2 Desktop/Mobil bestanden, echte Anmeldung,
  explizite Mandantenauswahl, alle 13 Apply-Aktionen, Refresh, Reset und sichtbarer
  OFFLINE-/ACTIVE-Status auf der Produktseite. Zwei erste Testläufe scheiterten
  am APIRequestContext beziehungsweise einem mehrdeutigen Locator; nur das neue
  Testskript wurde korrigiert. Die Anwendung blieb unverändert.
- Zusätzliche mobile Field-Service-Journey: 1/1 bestanden, echte Rollen-/Tenant-
  Sessions, HTTP-Erzeugung/Planung/Zuweisung und Pflichtcheckliste, UI-Start,
  Arbeitsbericht, Material, 105 Netto-Arbeitsminuten und gezeichnete
  Technikerbestätigung, HTTP-Abschluss und UI-/Audit-Verifikation. Fremde ID,
  fremder Tenant, USER ohne passende Freigabe, Rolleneskalation, verfrühter
  Abschluss und Änderung nach Abschluss werden abgewiesen. Drei anfängliche
  Testläufe waren nicht erfolgreich: fehlender Pflichttermin, Rollen-Selektor
  sowie eine in der Zukunft liegende feste Endzeit; die Zeit wurde durch
  relative vergangene UTC-Zeiten ersetzt. Erfolgsbeleg:
  `resume-field-browser-past-times`. Synthetische abgeschlossene Aufträge und
  Auditspuren bleiben in der isolierten Test-DB erhalten; keine echten Nachrichten.
- SBOM um Anwendungswurzel und direkte Abhängigkeitskanten ergänzt. 750 gelockte
  Komponenten, 751 Graphknoten, eindeutige und auflösbare Referenzen geprüft.
  Dies ist eine Lockfile-SBOM einschließlich Entwicklungs-/Optionalpaketen,
  keine Image-/Betriebssystem-SBOM oder externe Schema-Zertifizierung.
- Release-Workflow verwendet denselben RELEASE_VERSION-Wert für SBOM und
  Verpackung. Verpackung prüft Commit/Version/Lockfile gegen die SBOM, nimmt
  Migrationen und Preflight mit und benötigt einen vorhandenen Production Build.
- Lokales Web-Archiv, drei Worker-Bundles, Metadaten, SBOM und sechs SHA-256-
  Prüfsummen erzeugt. Archiv-Inventar, Ausschluss privater Dateipfade,
  Worker-Syntax und alle Checksummen bestanden. Keine Worker gestartet, keine
  Hardware- oder Providerverbindung und kein Deployment.
- Das Standalone-Artefakt wurde aus einem frischen OS-Temp-Verzeichnis gestartet.
  Zunächst scheiterte der Login-POST mit HTTP 500, weil Next das optionale native
  Argon2-Binding nicht nachverfolgte. Das Packaging kopiert nun das gesperrte
  plattformspezifische Binding explizit mit und bricht bei nicht unterstütztem
  Plattformmapping oder fehlendem Paket ab. Struktureller Verifier danach PASSED
  (750 Komponenten, 751 Graphknoten, 2.855 Tar-Einträge); Runtime-Smoke PASSED:
  Health, Readiness, Login-Seite, synthetischer Login und authentifiziertes
  Dashboard. Dies belegt nur das lokale Windows-x64-Paket, keine Container.
- Acceptance-/RC-Dokumente, README, Architektur, Releasehinweise und Changelog
  mit dem tatsächlichen Arbeitsstand zusammengeführt.

Die maschinenlesbare [Belegübersicht](PHASE-5V-RESUME-EVIDENCE.json) enthält
Prüfmetadaten und SHA-256-Werte ausgewählter lokaler Reports. Private Konfiguration,
Sitzungsdaten und vollständige lokale Logs werden nicht ins Repository übernommen.

## Fortsetzung ab WIP `4932f00`

- Die versionshistorische Supportgrenze wurde auf den einzigen dokumentierten
  Tag `v0.4b-pilot-ready` (7 Migrationen) und die neue 47-Migrations-v1.0-
  Baseline festgelegt. 008/009 fehlen im alten Tag und wurden später nur in
  einem nicht getaggten Entwicklungscommit eingeführt. Ungetaggte interne/dev-
  Historien sind nicht Teil der v1.0-Upgradeunterstützung; der Preflight stoppt
  unbekannte oder abweichende Checksummen. Details und Hashes: [Baseline](../MIGRATION-BASELINE.md).
- Unterstützter Upgradepfad v0.4b→v1.0 isoliert bestanden: 7→47 Migrationen,
  7/7 synthetische Datensätze aus Tenant, User, Property, Building, Unit, Meter
  und Reading erhalten; 7/7 vorherige Migrationszeilen unverändert; 008/009
  zuerst in der korrigierten Fassung registriert; Prisma Validate, Schema-Diff
  ohne Drift und 3/3 App-Smokes bestanden. Kein History-Resolve oder -Edit.
  [Detaillierter Migrationsbeleg](SUPPORTED-UPGRADE-V0.4B-4932F00.json).
- Clean Install 47 Migrationen, Seed/Verify und Clean-/Upgrade-HTTP-Health-Smoke
  waren bereits auf dem unveränderten Code bestanden und wurden nicht wiederholt.
- Dependency Audit `pnpm audit --json`: PASSED, pnpm 12.5.1/Linux WSL, Exit 0,
  765 Dependencies, 0 info/low/moderate/high/critical Advisories. Git SHA und
  Lockfile-SHA sind im [Audit-Beleg](DEPENDENCY-AUDIT-4932F00.json) dokumentiert.

## Offene Release-Gates

1. **Container-/Image-Abnahme:** lokales Windows-Paket strukturell geprüft und
   aus frischem entpacktem Verzeichnis mit Health-/Readiness- und echtem
   synthetischem Login/Dashboard-Smoke bestanden. Web-/Worker-Container noch
   nicht gebaut oder abgenommen. Docker CLI vorhanden, Linux-Daemon-Pipe am
   29.09. nicht erreichbar. Keine Image-Digests.
2. **Signing/Provenance:** `NOT_CONFIGURED_NOT_VERIFIED`, keine Signatur und
   keine verifizierte Releaseidentität. Prüfsummen sind kein Signaturnachweis.
3. **CI/Staging/finaler SHA:** kein Remote, keine Actions-Ausführung, keine
   Staging-Bereitstellung/-Abnahme. Arbeitsbaum dirty, Paketversion 0.1.0,
   unveränderlicher v1.0-RC weiterhin nicht vorhanden.
4. **Produktionskapazität/Failover:** lokale Performance-Grenzwerte bestanden;
   konkurrierende Last, gefüllte Worker-Queues und produktionsähnlicher Betrieb
   sind nicht gemessen.

## EXTERNAL_VALIDATION_PENDING

Getrenntes Staging, reale MQTT-/Mail-/Webhook-/Storage-Ziele, externer
Malwarescanner, PITR/Provider-Restore und vollständiger Restore-Drill sowie
Monitoring-/Failoverbetrieb. Der lokale Testscanner und Command-Adapter sind
keine Providerabnahme. Diese Fortsetzung nutzt ausschließlich synthetische Daten.

## HARDWARE_VALIDATION_PENDING

Physische Zähler, Gateways, RS485/Modbus RTU/TCP, M-Bus/W-MBus, Pulse,
LoRaWAN und Herstellergeräte. Keine reale Hardware angeschlossen oder geprüft.

## Nächster Schritt

Als Nächstes Container-/Worker-Images, Signing, CI/Staging und betriebliche
Kapazitäts-/Failover-Gates für einen festgelegten SHA abnehmen. Der v1.0-Support
bleibt auf die dokumentierte Baseline und den getesteten Upgradepfad begrenzt.
Erst nach den offenen Gates über den finalen RC entscheiden.
