# Software Acceptance Result

## Aktuell: echte Linux-Container-Abnahme ab ddbedc8, 01.10.2026

**NICHT RC-FREIGABEFÄHIG.** Die Runtime-, Shutdown-, Recovery- und Performance-Gates
sind lokal belegt; das geforderte Ausschluss-Gate für das Worker-Image ist FAILED.
Keine Images neu gebaut, kein finaler RC-Commit, kein Push/Tag/Deployment.
Die folgenden älteren Stände bleiben Historie; ihre Angaben „Daemon fehlt“ und
„Container NOT_EXECUTED“ gelten für diesen neuen Lauf nicht mehr.

### Identität und Provenance

Docker Client/Engine 29.8.0, Desktop 4.91.0, Context desktop-linux, linux/amd64.
Web: meterwerk-web:ddbedc8, Image-ID/RepoDigest
`sha256:34e78eaf3a4dadce73cea59dc25d93167ded3d6aaac75262d3f5cc39411d5733`, erstellt 2026-10-01T07:26:59.560412059Z.
Worker: meterwerk-worker:ddbedc8, Image-ID/RepoDigest
`sha256:c3519d93ebde310dd95ceeddd12f388227284a93972f99e72479f633c6280556`, erstellt 2026-10-01T11:33:13.063953051Z.
Beide tragen Git SHA ddbedc83c962248837bbdd81094504d6cb3209b8 und
Build-Timestamp 2026-10-01T07:21:56Z, Version 0.1.0, Base-Label node:22-alpine.
Der Worker-Erstellzeitpunkt ist später als das gemeinsame Build-Label.
Die pnpm-workspace.yaml im vorhandenen Builder stimmt normalisiert mit dem
Arbeitsstand überein. Die Build-Logs belegen das freigegebene Linux-Postinstall.
Das zusätzliche allowBuilds für @embedded-postgres/linux-x64 bleibt uncommittet;
die Images werden ausdrücklich nicht als sauberer Git-Commit ausgegeben.

### Web und Lifecycle

Tatsächlicher Container `9e61540f194cc8f818258577303dd1dc49a85daa2b2e92d9e5650da6a25353ea`, exakt obige Image-ID,
keine Mounts als Ersatz für das Image. 7/7 HTTP-/Browser-Checks plus laufender
Container: 8/8, 0 Fehler. Geprüft: Liveness, Readiness, Login-Seite,
synthetischer Login mit Dashboard, authentifiziertes /api/meters 200,
unauthentifiziertes /api/meters 401 sowie Build-SHA. Login und Dashboard werden
im Browser-Check gemeinsam gezählt. Kein Standalone-Extrakt als Ersatz.
Nach DB-Recovery erneut 7/7 HTTP-/Browser-Checks.

SIGTERM im Ready-Zustand: 1855,33 ms, Exit 143, kein OOM/SIGKILL.
Zusätzlicher Drain-Nachweis: authentifizierter Request beim Signal noch offen,
nach 6436,82 ms HTTP 200; Shutdown 11903,25 ms,
Exit 143, kein SIGKILL. Danach derselbe Container wieder ready.
Dieser Drain-Lauf benötigt mehr als zehn Sekunden; Shutdown-Fristen müssen
ausreichend Zeit gewähren. Eine erzwungene Beendigung wurde nicht als Erfolg gezählt.

### Worker, Lease und Recovery

3/3 Commands gestartet: node --conditions=react-server dist/rules-worker.js,
dist/rollout-worker.js und dist/mqtt-worker.js. Alle bleiben betriebsbereit,
MQTT subscribed, keine unmittelbare Runtime Exception. 3/3 Bundle-Hashes stimmen;
alle Manifest-Imports auflösbar, tsx fehlt. Pro Worker SIGTERM und Stop-Log bestanden,
Exit jeweils 0: Rules 428,50 ms,
Rollout 344,14 ms, MQTT 547,72 ms.
Vollständige Commands, Image-/Container-IDs stehen in der Evidence.

Lease: echter Rules-Worker A claimt einen synthetischen lokalen Mailjob.
Eine Test-DB-Barriere verzögert ausschließlich dessen Completion. A wird gezielt
mit SIGKILL beendet (Exit 137, nur Ausfallsimulation), seine noch aktive DB-Sitzung
terminiert; nach Ablauf der echten 60-s-Lease übernimmt B. 2 Claims, 1 committed
Completion, nach B-Neustart unverändert 1 Completion. Testregel, Trigger/Funktion
und Prüftabelle entfernt. Keine externe Nachricht. Dies ist kein Beweis für
Exactly-once-Nebenwirkungen bei realen Providern. Der erste Versuch ohne
DB-Sitzungsabbruch schloss noch in PostgreSQL ab und zählt nicht als Recovery-Erfolg.

Web-/Worker-Restart bestanden. MQTT-Broker kurz gestoppt, laufender MQTT-Worker
subscribed danach erneut. Isolierte DB kurz gestoppt: Liveness 200, Readiness 503
nach 5230,58 ms; nach DB-Start Readiness 200 und
Login/API-Smoke bestanden. Rules-Worker bleibt am Leben und stoppt danach mit 0;
in diesem kurzen Zeitfenster wurde kein fehlgeschlagener Rules-Zyklus beobachtet.

### Image Inspection und SBOM

Web ENTRYPOINT node / CMD server.js; Worker ENTRYPOINT node --conditions=react-server /
CMD dist/rules-worker.js. Beide User meterwerk, WorkingDir /app, linux/amd64.
Web EXPOSE 3000/tcp; Worker keine Ports. Kein vollständiger Dev-Workspace,
keine .env-/Key-Dateien, kein tsx. Scan: Web 2.854 und Worker 28.166 Dateien,
0 bekannte Test-Secret-Werte. Muster-Treffer sind geprüfte Base64-Teilstrings
und Dokumentationsplatzhalter; 0 ungeklärte Treffer. Scope: zusammengeführtes
/app-Dateisystem und Image-Konfiguration, kein vollständiger historischer Layer-Scan.

**Image-Ausschluss-Gate FAILED:** Worker enthält 309 test/spec-Dateien aus
Abhängigkeiten sowie physische Pakete @playwright/test, TypeScript und Prisma CLI.
pnpm --prod allein beweist deshalb kein von Test-/Dev-Artefakten bereinigtes Image.
Der Web-Pfad api/webhooks/[id]/test ist eine produktive Route, keine Testdatei.
Keine Produktcode-/Dockerfile-Korrektur in diesem Abnahmelauf.

Vorhandene CycloneDX-Image-SBOMs exakt per OCI-purl an die getesteten IDs gebunden:
Web 298, Worker 623 Komponenten. Datei-SHA-256, RepoDigests, Labels und Bundle-
Manifest stehen in der [Evidence](CONTAINER-RUNTIME-DDBEDC8.json). Das Base-Image
node:22-alpine ist über Labels/Dockerfiles belegt; ein unveränderlicher Base-Digest
wurde nicht unabhängig verifiziert. Keine alte Lockfile-SBOM als Image-Nachweis.

### Linux-Performance

Messung 2026-10-01T12:15:53.988Z, UTC; Auswertung Europe/Berlin (UTC+02:00).
Separater Linux-Testcontainer, Node 22, tatsächlicher Webcontainer und isoliertes
PostgreSQL. Vorhandene synthetische Messdaten, Zeitraum 2026-09-29T11:00:00.000Z
bis 2026-10-01T11:00:00.000Z, UTC. 30 sequenzielle Samples je Reihe, 7 Warmups ausgeschlossen:
210 Samples = 150 HTTP-Requests + 60 DB-Zyklen, 0 Fehler. Queue/Worker sind reale
Funktionsaufrufe gegen PostgreSQL mit leeren Queues im Testcontainer, keine
belasteten Job-Benchmarks des Worker-Prozesses. Keine Produktionskapazitätszusage.

| Messreihe  | Samples | Errors | p50 ms | p95 ms | sequenzielle Ops/s |
| ---------- | ------: | -----: | -----: | -----: | -----------------: |
| dashboard  |      30 |      0 | 366,34 | 516,76 |               2,69 |
| readings   |      30 |      0 |  23,95 |  39,88 |              37,61 |
| analytics  |      30 |      0 |  42,82 |  93,96 |              19,96 |
| publicApi  |      30 |      0 |  32,04 |  43,52 |              30,25 |
| fleet      |      30 |      0 |  45,86 |  80,70 |              19,34 |
| queueClaim |      30 |      0 |   1,72 |   2,99 |             525,10 |
| worker     |      30 |      0 |   4,49 |   6,78 |             212,59 |

Vorhandenes Performance-Regressionsgate: PASSED, alle 7 Budgets eingehalten.
Die ersten Messversuche scheiterten an fehlendem Reportverzeichnis und fehlender
Szenario-Fixture; der erfolgreiche Lauf verwendet tatsächlich vorhandene Seed-
Messwerte. Historische Windows-Messungen werden nicht als neue Linux-Werte gezählt.

### Offene Gates

Software-Release-Blocker: Worker-Image von Test-/Dev-Artefakten bereinigen und
danach gezielt Runtime/Lifecycle/Inspection/SBOM neu verifizieren.
Lokale Gates: diese Image-Korrektur sowie Abschluss auf unveränderlicher
Release-Revision. EXTERNAL_VALIDATION_PENDING: CI auf finalem SHA, Staging/Promotion,
Signatur-Verifikation, Provider, HA/PITR/Full Restore und repräsentative Last.
HARDWARE_VALIDATION_PENDING bleibt unverändert. Kein finaler RC-Commit.

## Historische Prüfstände — durch obigen aktuellen Stand ergänzt

## Historisch: Container-Abnahme ab `5d8fc58`, 01.10.2026

Ausgangsstand `5d8fc58f8882f44b3c981c33efcf15217b53d74f`, `master`, clean.
Docker CLI 29.8.0 ist vorhanden; `docker version` und `docker info` enden mit
Exit 1, weil die Pipe `dockerDesktopLinuxEngine` fehlt. `docker context show`
und `docker context ls` bestehen; der vorgesehene Context `desktop-linux` ist
bereits aktiv. Kein Contextwechsel, keine Sicherheitsrichtlinie geändert.

Web-/Worker-Image-Build, Runtime, SIGTERM, Lease-Recovery, Image-Inspection,
Image-Secret-Check und Image-SBOM sind **NOT_EXECUTED**. Keine Image-IDs,
Digests, Größen oder Buildzeitpunkte wurden erfunden. `node:22-alpine` ist
nur das konfigurierte Basisimage. **SOFTWARE_FIX=PASSED** wird übernommen;
**LINUX_IMAGE_RUNTIME=NOT_EXECUTED / EXTERNAL_VALIDATION_PENDING** bleibt offen.

Der ausdrücklich angeforderte neue Performance-Lauf scheiterte zweimal bereits
beim Dashboard-Warmup mit HTTP 500: zuerst über `next start`, danach über das
frisch entpackte vorhandene Standalone-Artefakt. Direkter Import diagnostiziert
`ERR_DLOPEN_FAILED`: Windows Application Control blockiert das vorhandene
Argon2-Windows-x64-Binding. Kein Paketwechsel, keine Policy-Umgehung.
**0 gemessene Samples, 2 fehlgeschlagene Warmups, keine aktuellen p50/p95 oder
Throughput-Werte.** Das Performance-Gate ist **FAILED**, alle sieben Messreihen
fehlen. Die äußere Shell meldete beim Acceptance-Runner Exit 0; maßgeblich sind
die gespeicherten Child-Exitcodes (3221226505, 3221226505, Gate 1) und Assertions.

Die bisherigen Performancewerte bleiben ausschließlich historischer Nachweis
vom 28.09.2026: je 30 Messungen, zusammen 210 (150 HTTP, 60 DB-Worker-Zyklen),
0 Fehler; Queue/Worker liefen mit leeren Queues, Throughput wurde nicht gemessen.

| Bereich     | Historisch p50 / p95 in ms |
| ----------- | -------------------------- |
| Dashboard   | 296,502 / 318,008          |
| Readings    | 16,187 / 20,689            |
| Analytics   | 30,906 / 35,673            |
| Public API  | 29,516 / 34,418            |
| Fleet       | 32,559 / 49,506            |
| Queue Claim | 1,112 / 1,666              |
| Worker      | 2,736 / 4,405              |

Umgebung des neuen Versuchs: Windows x64, Node 24.19.0, bestehender isolierter
PostgreSQL-17.10-Cluster auf `127.0.0.1:55435`, Web auf `127.0.0.1:3105`,
synthetische Daten, lokaler Mailprovider. Test-Webprozesse wurden beendet und
PostgreSQL kontrolliert gestoppt. Das ist kein Linux-Lifecycle-/Failover-Nachweis.

CI bleibt **CONFIG_VERIFIED**, kein Actions-Lauf und kein Remote. Die statische
Prüfung bestand; Docs, Artifact-Verifier, Worker-Statik, beide Image-Builds,
Runtime-Smokes, Audit, SBOM, Secrets, Unit, Integration, Security, Browser und
Production Build sind konfiguriert; Actions gepinnt, minimale Permissions,
`persist-credentials: false`, frozen Lockfile und pnpm 12.5.1 vorhanden.
Die Runtime-Skripte ersetzen noch keine vollständige Abnahme: Web-Exitcode,
authentifiziertes `/api/meters`, unauthentifizierte Ablehnung, Build-SHA sowie
laufende Worker-Jobs/Lease-Recovery sind beim echten Containerlauf zusätzlich
zu prüfen. Die fünf bisherigen Image-Gate-Regressionstests werden übernommen.

Provenance: 8/8 vorhandene Artefakt-Checksummen stimmen; Lockfile-Hash stimmt
mit dem bestandenen Audit (765 Dependencies, 0 Advisories) überein. Das Paket
bleibt korrekt als `edda867` / damaliger dirty-Baum / Windows x64 / Build-ID
`Mbdd5CvIdTqO6ja5wEEXg` gekennzeichnet. Es wurde nicht auf `5d8fc58` umetikettiert.
Keine erneute große Regression, kein neuer Build, keine Code-/Dockerfile-/
Workflow-/Lockfile-Änderungen in diesem Lauf. Einzelwerte, SHA-256 und Zeitpunkte:
[Container- und Performance-Evidence](CONTAINER-READINESS-5D8FC58.json).

Abschluss dieses Laufs: Dokumentationslinks 95 Markdown-Dateien, 13
Pflichtreferenzen, Prettier für 5 geänderte Dateien und `git diff --check`
bestanden. Secret Scan: 0 Review-Funde, 18 bekannte Demo-/Vorlagenwerte.
Keine neuen Unit-/Integrations-/Browser-Tests ausgeführt; unveränderte
bestandene Suiten werden übernommen. Die Testports 3105 und 55435 sind nach
dem Aufräumen nicht mehr belegt. Git bleibt auf `5d8fc58`; nur die vier
Acceptance-Dokumente und der neue JSON-Beleg sind uncommittiert.

**Kein neu nachgewiesener SOFTWARE RELEASE_BLOCKER.** Der alte Worker-Softwarefix
bleibt bestanden; Docker und die aktuelle Windows-Native-Blockade sind offene
lokale Umgebungs-/Release-Gates. Deshalb **v1.0 RC vorbereitet: NEIN**, kein
finaler Commit. Staging und Provider-/HA-/Restore-Prüfungen bleiben
`EXTERNAL_VALIDATION_PENDING`, Signing `SIGNING_PREPARED_NOT_VERIFIED`,
Hardware `HARDWARE_VALIDATION_PENDING`. Keine Production oder Kundendaten.

Die folgenden Abschnitte sind historische Nachweise.

## Historisch: Fortsetzung von `943d23f`, 01.10.2026

Worker-Bundles waren bereits abgeschlossen. Am offenen Image-/Lifecycle-Gate
wurden vier Fehler gezielt korrigiert; fünf neue Regressionstests bestehen.
Docker-Linux-Daemon weiterhin nicht erreichbar. Container, Signing, CI, Staging
und Failover bleiben offen; keine RC-Freigabe. Maßgeblich ist der
[Checkpoint-Fortsetzungsbericht](PHASE-5V-CHECKPOINT-943D23F.md).
Die folgenden Abschnitte dokumentieren frühere Nachweisstände.

### Phase 5v Worker-Runtime-Fix — lokaler Nachweis auf WIP `edda867`

Der WIP-Stand `edda867` wird mit einer mehrstufigen Worker-Image-Struktur
fortgesetzt: drei vorhandene TypeScript-Worker werden zu JavaScript-Bundles
gebaut; das Runtime-Image erhält nur den per `pnpm install --prod` aufgelösten
Produktions-Abhängigkeitsgraph, Prisma-Client und Worker-Bundles. `tsx` und
Entwicklungsabhängigkeiten werden nicht in die Runtime kopiert. Rules und
Rollout reagieren kontrolliert auf SIGINT/SIGTERM; MQTT leert die laufende
Nachrichtenkette und schließt Broker/DB beim Herunterfahren.

Die Änderungen bestanden TypeScript, ESLint, Prettier, Production Build,
Rules-DB-Integration, SBOM-/Artefakt-Verifikation, Standalone-Smoke,
Dokumentations- und Secret-Gates. Die Worker-Image-Statikprüfung zählte vier
Build-/Runtime-Stages, 317 Pakete im Produktions-Abhängigkeitsabschluss,
keinen `tsx`-Eintrag, drei JS-Bundles und keine Source Maps. Der Artefakt-
Verifier prüfte 750 SBOM-Komponenten, 751 Graphknoten, 2.855 Archiv-Einträge
und 8 SHA-256-Dateien; der frische Standalone-Smoke bestand 4/4 Checks. Details
stehen im [Fortsetzungsbericht](PHASE-5V-RESUME.md).

Die lokale Docker-CLI meldet Version 29.8.0, der Docker-Desktop-Linux-Daemon ist
nicht erreichbar. Reale Web-/Worker-Image-Builds, Container-Smokes, Image-Digests
und Image-SBOM bleiben `NOT_EXECUTED` / `EXTERNAL_VALIDATION_PENDING`; die
statische Image-Prüfung ersetzt sie nicht. Performance wird aus dem vorhandenen
HTTP-/DB-Lauf übernommen (210 Requests, 0 Fehler). Failover, Staging, ein
GitHub-Actions-Lauf auf finalem SHA und Signaturverifikation bleiben offen.

> **Historischer Stand: 29.09.2026, WIP `a873a87`; siehe den aktuellen Bericht oben.**
> Die historischen Teil-2-/Teil-3-Aussagen unten bleiben als Verlauf erhalten.
> Maßgeblich für die Fortsetzung sind [Phase-5v-Fortsetzungsbericht](PHASE-5V-RESUME.md)
> und [RC-Checkliste](../checklists/RC-ACCEPTANCE-CHECKLIST.md).

### Historischer Phase-5v-Gate-Stand auf `a873a87`

Der Production-Build wurde für `a873a87fbce94f2f8f547343e8347a1507c80ba0`
neu erstellt (Next.js 16.3.5, 69 Seiten, Windows x64). Standalone-Web-Tar,
drei Worker-Bundles, Lockfile-SBOM mit 750 Komponenten/751 Graphknoten und
sechs SHA-256-Prüfsummen stimmen mit Commit und Lockfile überein. Der Artefakt-
Verifier bestand; das frisch entpackte Paket bestand 4/4 Loopback-Smokes:
Liveness, Readiness, synthetischer Login und authentifiziertes Dashboard.
Details und Hashes: [lokaler Artefaktnachweis](RELEASE-ARTIFACT-A873A87.json).
Die statische CI-Konfigurationsprüfung ist in
[CI-Review](CI-CONFIG-REVIEW-A873A87.json) festgehalten.

Docker Desktop CLI ist vorhanden, der Linux-Daemon jedoch nicht erreichbar;
Web-/Worker-Images und Image-SBOM sind daher `NOT_EXECUTED`. Zusätzlich führt
`Dockerfile.worker` zur Laufzeit `tsx` aus den Dev-Dependencies aus und kopiert
das ungefilterte `node_modules`; die Runtime-Minimierung ist nicht erfüllt und
bleibt ein Software-Release-Blocker bis zu Fix und Image-Verifikation.
Signing-Status: `SIGNING_PREPARED_NOT_VERIFIED`; Metadaten/SBOM/Checksummen
liefern lokale Provenance, aber es gibt weder echte Signatur noch Verifikation.
Die CI-Dateien sind statisch `CONFIG_VERIFIED` für gepinnte Actions,
`contents: read`, `persist-credentials: false`, pnpm 12.5.1 und frozen lockfile.
CI fehlt weiterhin ein Dokumentations-Gate und die Ausführung des Artefakt-
Verifiers; GitHub Actions wurde für diesen SHA nicht ausgeführt. Es gibt kein
Git-Remote. Staging und Provider-/Hardwareprüfungen bleiben pending.

Die lokalen Release-Artefakte nennen Paketversion `0.1.0` und Zielversion
`1.0.0`; sie sind keine finalen RC-Artefakte und keine RC-Freigabe.

Demo-Produktwirkungen, lokale Performance-Regression, transitive Lockfile-SBOM
und das lokale Windows-x64-Standalone-Paket wurden nachgewiesen. Die
v1.0-Datenbankbaseline ist auf die 47 kanonischen Migrationen festgelegt; der
einzige dokumentierte Vorläufer `v0.4b-pilot-ready` mit sieben Migrationen
bestand den Upgrade-Smoke auf 47. Die unveränderte Lockfile-Abhängigkeit bestand
`pnpm audit --json` (pnpm 12.5.1, Exit 0, 0 Advisories in allen Schweregraden).
Migrations- und Dependency-Audit-Gates sind damit für diese Supportgrenze
geschlossen. Offen bleiben Container-/Worker-Images, Signing/Provenance,
CI/Staging für einen unveränderlichen SHA sowie Kapazitäts-/Failoverabnahme.
Provider- und Hardwarestatus siehe unten. Einzelbelege stehen im
[Fortsetzungsbericht](PHASE-5V-RESUME.md), [Baseline-Entscheid](../MIGRATION-BASELINE.md)
und [Audit-Provenance](DEPENDENCY-AUDIT-4932F00.json).

- Historischer Acceptance-Ausgangsstand in der folgenden Dokumentation: `f444ea62207ed532b4329c29b9396e4703902ecc`
- Package version: `0.1.0`
- Recorded at: `2026-09-25T14:13:17.704Z`
- Scope: local software checks executed by `pnpm acceptance:software`.

## Executed checks

- **PASSED** — Prisma validate (exit 0)
- **PASSED** — Prisma generate (exit 0)
- **PASSED** — Typecheck (exit 0)
- **PASSED** — ESLint (exit 0)
- **PASSED** — Prettier (exit 0)
- **PASSED** — Unit tests (exit 0)
- **PASSED** — Security regression (exit 0)
- **PASSED** — Documentation links (exit 0)
- **PASSED** — Documentation references (exit 0)
- **PASSED** — Secret scan (exit 0)
- **PASSED** — Dependency audit (exit 0)
- **PASSED** — Staging Compose syntax (exit 0)
- **PASSED** — Production build (exit 0)

## Not executed by this command

- PostgreSQL clean-install / upgrade integration tests and HTTP/API suites requiring a dedicated test database.
- Docker/Web/Worker images, staging runtime/promotion, browser E2E against a running environment, and provider-backed storage/mail/MQTT/PITR tests. The staging Compose file is parsed statically when Docker CLI is available.
- Physical meter, gateway, radio/network, and vendor hardware validation.
- Production performance and failover measurements.

## Acceptance inventory

- **PARTIALLY_VERIFIED** — Multi-tenancy, roles, user grants and tenant isolation
- **PARTIALLY_VERIFIED** — Authentication, sessions and MFA
- **PARTIALLY_VERIFIED** — Electricity, water, gas and heat metering
- **PARTIALLY_VERIFIED** — Readings, historical data, units and aggregations
- **PARTIALLY_VERIFIED** — Meter replacement and tariff/cost paths
- **PARTIALLY_VERIFIED; HARDWARE_VALIDATION_PENDING** — MODBUS_RTU / MODBUS_TCP software paths
- **PARTIALLY_VERIFIED; HARDWARE_VALIDATION_PENDING** — MBUS / WMBUS / PULSE / LORAWAN adapters and simulations
- **PARTIALLY_VERIFIED** — REST ingestion and MQTT gateway ingestion
- **EXTERNAL_VALIDATION_PENDING** — VENDOR_API providers
- **PARTIALLY_VERIFIED** — Device profiles, gateway heartbeat and health
- **PARTIALLY_VERIFIED** — Edge store-and-forward, replay and idempotency
- **PARTIALLY_VERIFIED** — Dashboards, analytics, forecasts and anomalies
- **PARTIALLY_VERIFIED** — Alarms, reports and CSV/PDF exports
- **PARTIALLY_VERIFIED** — Rules, conditions, actions, cooldown and deduplication
- **PARTIALLY_VERIFIED** — Scheduled rule checks, retries and lease recovery
- **PARTIALLY_VERIFIED** — WorkOrders, assignments, checklists and technician workflow
- **PARTIALLY_VERIFIED** — Attachments, time/material, commissioning and signatures
- **PARTIALLY_VERIFIED** — Devices, fleet, credentials, diagnostics and lifecycle
- **PARTIALLY_VERIFIED** — Firmware metadata, rollout, maintenance and remote commands
- **PARTIALLY_VERIFIED** — Public API keys, scopes, rotation, limits and tenant binding
- **PARTIALLY_VERIFIED** — Webhook signatures, replay, retry and delivery state
- **PARTIALLY_VERIFIED** — Support, incidents, maintenance mode, queues and worker health
- **PARTIALLY_VERIFIED** — Liveness, readiness, build information and observability
- **VERIFIED for executed regression tests** — Auth/authorization, CSRF, injection, SSRF and privilege regression
- **PARTIALLY_VERIFIED; EXTERNAL_VALIDATION_PENDING for scanner provider** — Upload policy, quarantine and malware scanning
- **PARTIALLY_VERIFIED** — Backup registry, verification, retention and RPO/RTO logic
- **EXTERNAL_VALIDATION_PENDING** — PITR, provider restore and full restore drill
- **PARTIALLY_VERIFIED** — Demo seed/reset/scenarios and environment guards
- **EXTERNAL_VALIDATION_PENDING** — Staging deployment, acceptance and promotion
- **PARTIALLY_VERIFIED** — PWA manifest, offline and reconnect behavior
- **IMPLEMENTED; CI not run for this working tree** — CI workflow and release artifact definitions
- **PARTIALLY_VERIFIED; signing not configured/verified** — SBOM generation and signing preparation
- **VERIFIED for executed checks** — Documentation link/script quality gates
- **VERIFIED for executed checks** — Dependency audit and secret scan
- **NOT_EXECUTED** — Database clean install / upgrade / relational integrity
- **NOT_EXECUTED** — Browser E2E and HTTP/API integration against running app
- **HARDWARE_VALIDATION_PENDING** — Physical meters, gateways and vendor hardware
- **NOT_EXECUTED** — Production performance / failover measurements

## Historisches Release blocker assessment auf `a873a87`

Ein Software-Release-Blocker bleibt offen: Das Worker-Image benötigt aktuell
`tsx` aus den Dev-Dependencies und installiert zusätzlich ungefilterte
Dev-Dependencies. Die Container-Runtime wurde mangels Docker-Daemon nicht
gebaut oder ausgeführt. Der lokale Standalone-Web-Artefakt-Smoke ist davon
getrennt bestanden; dies ist keine RC-Freigabe.

## Findings fixed during this acceptance

- Runtime security configuration now accepts the supported `staging` and `demo` environments; regression tests cover both.
- MQTT transport security follows the explicit Meterwerk environment so an isolated staging broker does not inherit pilot/production TLS requirements solely from `NODE_ENV=production`; production/pilot TLS guards remain covered.
- Staging Compose now uses actual worker entrypoints/images, MQTT and attachment-storage variables, a private persistent attachment volume and an explicit read-only receipt-key file. Static Compose parsing passed; services were not started.

These checks require isolated services, credentials, provider infrastructure, or real hardware and are not implied by the local software checks.

## Phase 5v Teil 2 — Nachprüfung am 28.09.2026

- **Baseline:** `09427c6b74c1ae3cb4355fa51ac3e6c531f1045e` (`WIP Phase 5v part 1`).
- **HEAD:** derselbe Commit; alle Teil-2-Änderungen sind uncommittet. Es existiert kein finaler RC-Commit.
- **Umgebung:** lokales Windows 11, Node `v24.19.0`, `win32/x64`, eingebettetes PostgreSQL `17.10`, nur Loopback `127.0.0.1:55435`, Datenbank `meterwerk_acceptance`, `METERWERK_ENV=test`, synthetische Demo-Daten.
- **Prisma:** Validate und Generate PASSED. Clean Install PASSED mit 46 Migrationen; Upgrade PASSED von 39 auf 46 Migrationen und Datenerhalt in 17 geprüften Tabellen. Tenant-/FK-Integritätsläufe: 24/24 DB-Acceptance und 9/9 Field-Service-DB-Tests PASSED.
- **Typecheck / ESLint / Prettier / Diff:** jeweils PASSED. TypeScript `tsc --noEmit` Exit 0; ESLint Exit 0; Prettier `--check .` meldete „All matched files use Prettier code style“; `git diff --check` Exit 0.
- **Unit:** PASSED, 39/39 Dateien und 285/285 Tests. Alle zuvor am Sandbox-Prozess gescheiterten Testdateien luden jetzt.
- **Security:** PASSED, 6/6 Security-Dateien und 63/63 Tests. DB-gestützte Security-Integration PASSED für MFA, Recovery-Codes, Reset-Replay und Invitation-Replay. Der bestehende Integrationstest meldete 18/18 Checks einschließlich Argon2-Passworthashprüfung PASSED.
- **HTTP/API:** PASSED, 84 Checks gegen die laufende lokale Production-App, einschließlich Authentifizierung, Session-Ablauf/-Widerruf, Tenant-Isolation, USER-Grants, CSRF und Schreibautorisierung. `/api/meters` wurde authentifiziert durch den HTTP-Test mit Status 200 geprüft; nicht authentifiziert bleibt 401.
- **Browser:** Der zuvor fehlgeschlagene Login-/Produktpfad bestand jetzt in 4/4 Browserprojekten (Desktop, Mobile, Mobile Landscape, Tablet). Zusammen mit den zuvor bestandenen 24 Browserfällen ist der dokumentierte Satz 28/28 über zwei Läufe bestanden; die komplette Suite wurde nach dieser Änderung nicht erneut als einzelner Lauf gestartet.
- **Production Build:** PASSED, `next build` Exit 0; 69 statische Seiten generiert. Lokaler Login POST 200, Redirect auf `/dashboard`.
- **Demo:** Reset und Seed liefen nur auf der isolierten Testdatenbank. Nach Ergänzung fehlender deterministischer Fixtures bestanden Seed/Verify: 2 Tenants, 7 Users, 6 Properties, 48 Meter, 41.064 Readings und jeweils 2 Devices, Gateways, WorkOrders, Supportfälle, Dashboards, Reports, Regeln und Anomalien. Produktions-Reset-/Seed-Guards blieben zuvor mit 2/2 Prüfungen bestanden. Szenarien speichern weiterhin nur Auswahl und Audit-Metadaten; ihre Produktwirkungen sind nicht implementiert.
- **Secret Scan:** PASSED, 0 Review-Funde, 17 bekannte Demo-/Template-Werte. Drei vorherige Build-URL-Treffer wurden durch Entfernen der unnötigen Platzhalter-Zugangsdaten beseitigt.
- **Dependency Audit:** NOT_EXECUTED. `corepack pnpm audit --prod` konnte `pnpm-native.exe` nicht starten (`spawnSync ... UNKNOWN`); daher liegen keine Advisory-Findings aus diesem Lauf vor.
- **Argon2-Ursache:** Lockfile und Installation enthalten `@node-rs/argon2` 2.2.1 mit dem Windows-x64-MSVC-Prebuild. Direkter Argon2id-Hash/Verify mit synthetischem Passwort funktionierte. Der frühere sandbox-gestartete Next-Prozess konnte das optionale native Modul nicht laden; nach Start der Production-App außerhalb dieses Prozesskontexts bestanden Build, HTTP und Login. Es wurde keine alternative oder schwächere Passwort-Hashung eingeführt.
- **Sonstige bereits bestätigte Teil-2-Ergebnisse:** Field-Service-Unit 53/53, Utility Integration 8/8, Public API 8/8, Webhooks 10/10, Rules 7/7, Protocol/Ingestion 5 Pfade und Production Guards 2/2 PASSED; Dokumentationslinks 92 und Referenzen 13 geprüft.
- **Nicht ausgeführt / weiterhin pending:** Performance Gate; Docker-Images/Worker-Image (Daemon fehlt); echte MQTT-Broker-/Provider-/Staging-/PITR-/Full-Restore-Prüfungen; Hardware. Die CI-Konfiguration wurde statisch geprüft, GitHub Actions aber nicht ausgeführt. Die SBOM umfasst 34 direkte Abhängigkeiten, 32 noch mit Versionsbereichen; keine aufgelöste transitive SBOM, Image-Checksummen oder Signatur.

### Historische offene RC-Blocker am Stand vor Commit `e88b1de` (28.09.2026)

- **RELEASE_BLOCKER — Demo-Szenarioverhalten:** Die Szenariowahl NORMAL, WATER_LEAK, HIGH_ELECTRICITY etc. erzeugt bislang keine szenariospezifischen Messwert-, Alarm-, Gateway-/Firmware- oder Wartungszustände. Vor RC muss dieses Verhalten implementiert und je zentralem Szenario gegen persistierte Produktdaten geprüft werden oder die beworbenen Szenarien müssen aus dem RC-Umfang entfernt werden.
- **RELEASE_BLOCKER — Migrationshistorie:** Die älteren Migrationen `202609240008_dashboards` und `202609240009_dashboard_recovery` wurden geändert, um Clean Install zu ermöglichen. Vor RC muss für jede zu unterstützende Bestandsdatenbank der tatsächliche Prisma-Migrationsstatus abgeglichen werden. Wo eine geänderte Migration bereits als angewendet registriert ist, ist eine sichere Forward-Migration/History-Strategie festzulegen; die lokalen Clean-Install-/39→46-Tests belegen dies nicht für beliebige Produktionshistorien.
- **RELEASE_GATE_NOT_CLEARED — Dependency Audit:** Keine Vulnerability wurde festgestellt oder ausgeschlossen, weil der Audit-Befehl nicht startete. Den Audit mit einer funktionierenden pnpm-12.5.1-Umgebung gegen denselben Lockfile ausführen und High/Critical Findings bewerten.
- **EXTERNAL_VALIDATION_PENDING:** echter Malware-Scanner-Provider, externe Mail/Webhook-/Storage-/MQTT-Ziele, Staging, PITR und Provider-Restore.
- **HARDWARE_VALIDATION_PENDING:** physische Zähler, Gateways, Funk-/Busadapter und Herstellergeräte.
- **Keine finale RC-Freigabe.**

## Phase 5v Teil 3 – Nachprüfung am 28.09.2026

- Arbeitsbaum blieb auf `master` / `09427c6b74c1ae3cb4355fa51ac3e6c531f1045e`; kein Commit erstellt.
- Demo-Szenario-Engine: **FAILED / RELEASE_BLOCKER**. `setDemoScenario` speichert weiterhin ausschließlich `DemoScenarioState` und `AuditEvent`; keine Szenario-Apply-/Verify-/Reset-Produktwirkung wurde ergänzt. Damit sind alle 13 Szenario-Produktpfade NOT_EXECUTED.
- Historische Migrationen: ursprüngliche und aktuelle SHA-256-Checksummen geprüft. 008: original `234edfd015d1a790bf1e2676bf1296ddb852420664e0ad9e713739eb8d61b171`, geändert `a650d334c72979b1b0d5c30cce1fc2b302c768b6a2aa75e92b6d62f405857b4a`; 009: original `4e5cb60b86fcb463ba1dcfa940408622ac04e41a60c0ade98d2d60c364c7bc23`, geändert `2e4ae9a39d6d5de3f721c3739c73db7983a1ae23f18a3b3e3467a1ebbf6776b6`. Die ursprüngliche 008 erzeugt nach der Tabellen-Unique-Constraint denselben Unique-Index erneut; die geänderte Fassung verwendet `IF NOT EXISTS`. Die ursprüngliche 009 fängt `duplicate_object` ab; die geänderte Fassung prüft `pg_constraint` statt gleichnamiger Indizes.
- Die lokale Acceptance-DB wurde im Teil-2-Lauf frisch mit geänderten Dateien migriert; ihre beiden gespeicherten Checksummen entsprechen deshalb den geänderten SQL-Dateien. Es gab keinen Zugriff auf eine registrierte Datenbank mit Originalchecksummen. Die getestete 39→46-Upgrade-Strecke belegt folglich keinen historischen-Checksum-/Bestandsdatenbankpfad. Originaldateien zurückzusetzen würde zudem den Clean-Install-Fehler in 008 wieder einführen. **Sichere Strategie für unbekannte Bestandszustände nicht festgestellt; RELEASE_BLOCKER bleibt.** Keine Prisma-Historie wurde manipuliert.
- Dependency Audit: **NOT_EXECUTED**. Direktes Starten des festgelegten `pnpm-native.exe` wurde durch Windows Application Control blockiert. Keine Advisories aus diesem Lauf; Findings unbekannt.
- Performance: vorhandenes Fixture erzeugt lediglich synthetische Last-Metadaten (100 Tenants, 10.000 Meter/Geräte, 10.000 Readings/Minute) und führt keine Requests oder DB-Last aus. Das Regression-Gate benötigt eine Messdatei mit p95/errorRate je sieben Komponenten. Deshalb **NOT_EXECUTED**, keine Performancewerte.
- SBOM/Artefakte: vorhandenes SBOM hat 34 direkte Komponenten, davon 32 bloße Versionsbereiche. Keine transitive Lockfile-SBOM, Image-Artefakte, Image-Checksummen oder Signatur erzeugt. Docker nicht verfügbar; Staging nicht gestartet; GitHub Actions nicht ausgeführt. Signing nicht konfiguriert.
- Diese Nachprüfung führte nur die vorhandene Performance-Fixture-Metadaten-Erzeugung und read-only Prüfungen aus. Sie führte keine Acceptance- oder Test-Suite erneut aus. Teil-2-Zahlen bleiben nur als Teil-2-Beleg dokumentiert und wurden hier nicht erneut getestet.
- Status Teil 3: **kein softwareseitiger RC-Abschluss**. Offene Bereiche bleiben Demo-Szenario-Implementierung und sichere Migrationskompatibilität; Dependency Audit ist ein nicht geklärtes Release-Gate.
