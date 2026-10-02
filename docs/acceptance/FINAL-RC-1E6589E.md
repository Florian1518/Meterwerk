# Finale lokale RC-Bewertung – Meterwerk v1.0

Stand: 02.10.2026. Bewerteter Commit: `1e6589e2ee84eae787e444a0ab311fb1020853e6`.
Ausgang: master, clean, kein Diff; geprüft mit git status, rev-parse HEAD,
log -5 --oneline und diff HEAD. Beide Images vor jeder getrackten Dokumentänderung gebaut.

**LOCAL SOFTWARE ACCEPTANCE: PASSED.**
**METERWERK V1.0 RC PREPARATION: READY.**
**Verbleibende LOCAL SOFTWARE RELEASE BLOCKER: NEIN.**

Dies ist PASSED_LOCAL für die lokale Softwarevorbereitung, keine Production-Freigabe.
Kein Commit, Push, Tag oder Deployment. Der Commit
`Prepare Meterwerk v1.0 release candidate` kann nach Review erstellt werden.
Die Images bleiben dem bewerteten SHA zugeordnet, nicht einem späteren Dokumentationscommit.
[Maschinenlesbare finale Evidence](FINAL-RC-1E6589E.json).

## Delta und Prüfentscheidung

Die vollständigen Dateilisten ab ddbedc8 (Web-/altes Worker-Image) und 5eae186
(Dirty-Worker-Nachlauf) stehen mit Kategorien in der JSON-Evidence.

| Kategorie                                                       | Delta ddbedc8 → 1e6589e                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Web-/Worker-Fachcode, Lease-Code, Prisma/Schema, Tests          | unverändert                                                                                                  |
| Gemeinsame Runtime-Abhängigkeiten, package.json, pnpm-lock.yaml | unverändert                                                                                                  |
| pnpm-workspace.yaml                                             | Linux-Postinstall-Freigabe; laut damaligem Builder-Abgleich bereits im validierten Dirty-Web-Build enthalten |
| Dockerfiles                                                     | ausschließlich Dockerfile.worker gehärtet; Web-Dockerfile unverändert                                        |
| Build/Packaging                                                 | deploy-worker-runtime.mjs und worker-runtime-policy.mjs                                                      |
| Acceptance/CI                                                   | Content-/Static-/Runtime-/SBOM-Validatoren, gezielte Tests, CI, ESLint                                       |
| Dokumentation/Evidence                                          | README, Architektur, Acceptance, Fähigkeiten, Einschränkungen, Checkliste                                    |

Web neu gebaut: **JA**, weil COPY . . den geänderten Build-Kontext übernimmt und
beide finalen Images eine eindeutige Clean-SHA-Provenance erhalten sollen.
Worker neu gebaut: **JA**, zwingender Ersatz des Dirty-Provenance-Artefakts.
Sieben dokumentierte Build-Eingaben des gehärteten Dirty-Worker-Images sind
bytegleich zum jetzigen Stand; dieser Vergleich ersetzt nicht den erfolgten Neubau.

Seit den älteren breiten App-Suites auf 4932f00 änderten sich ausschließlich vier
Worker-Lifecycle-Dateien in src/. Diese wurden anschließend durch echte Linux-
Runtime-, SIGTERM-, Lease- und Recovery-Prüfungen abgedeckt. Seit ddbedc8 sind
auch diese unverändert. Daher keine erneute vollständige Browser-/DB-/Demo-Suite.

## Finale Artefakte

### Worker

- Tag: `meterwerk-worker:rc-1e6589e`
- Image-ID: `sha256:7d78101dcc9aa1ba48eea93c5136c3be5ec41add44221b2df6fad2aaa4f07d7e`
- RepoDigest: `meterwerk-worker@sha256:7d78101dcc9aa1ba48eea93c5136c3be5ec41add44221b2df6fad2aaa4f07d7e`
- Plattform: linux/amd64; Größe: 253616244 Bytes; Build Exitcode: 0.
- Build-Timestamp (UTC): 2026-10-02T06:50:22.804Z; Image Created: 2026-10-02T06:51:16.691026975Z.
- Build-Version: 1.0.0-rc.1; vollständiger SHA: `1e6589e2ee84eae787e444a0ab311fb1020853e6`; Arbeitsbaum clean.
- SBOM: `.local/acceptance/final-rc-worker-sbom.cdx.json`; 80 Paketkomponenten, inklusive Betriebssystem; 281 Dependency-Knoten.
- SBOM SHA-256: `f749706a74142bf123da1b5c738be2584c3a4a28155f28984ac5417049fad25b`; Container-PURL exakt mit Image-ID abgeglichen.
- Plattformmanifest: `sha256:5fc5075405f72b4f3e562fde7f6decfa404e66dbe08502ea40f9455f744c0435`.
- Config-Digest: `sha256:5dfb8276fecb562df1f1e52ea3e6f7e00b9816d0b7742a2db0e555f78fc232e2`.
- BuildKit-Attestationmanifest: `sha256:0801b3ddc1950a263c4f8eca633c18896855085f10076b7c402c360e4233b9ca`.

### Web

- Tag: `meterwerk-web:rc-1e6589e`
- Image-ID: `sha256:a7073d4964b27ada5cc9dba076a380e825533dce79bcbe88e3cbf8a23c472cbb`
- RepoDigest: `meterwerk-web@sha256:a7073d4964b27ada5cc9dba076a380e825533dce79bcbe88e3cbf8a23c472cbb`
- Plattform: linux/amd64; Größe: 327162103 Bytes; Build Exitcode: 0.
- Build-Timestamp (UTC): 2026-10-02T06:51:19.050Z; Image Created: 2026-10-02T06:53:17.026765278Z.
- Build-Version: 1.0.0-rc.1; vollständiger SHA: `1e6589e2ee84eae787e444a0ab311fb1020853e6`; Arbeitsbaum clean.
- SBOM: `.local/acceptance/final-rc-web-sbom.cdx.json`; 298 Paketkomponenten, inklusive Betriebssystem; 729 Dependency-Knoten.
- SBOM SHA-256: `b9590dc49bfec2d52f64d727c50ef08589f80af9d615d631283d87e68b527874`; Container-PURL exakt mit Image-ID abgeglichen.
- Plattformmanifest: `sha256:9319ae6ad738d6ba24fff49335bea368b4079a68e756f8f389419b8176fc7f9b`.
- Config-Digest: `sha256:178c5ee3f704e385176869fa0b1a86abc45fd701a9f1cb33a7aee00e5a24340d`.
- BuildKit-Attestationmanifest: `sha256:ad0d5aa2ab38d0a7b6a131cd9edb0b45c4a21525b26f8e42d07b4cfdefe2db74`.

Beide Builds verwenden laut BuildKit-Materialnachweis node:22-alpine mit Digest
`0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`. Build-Logs und BuildKit-Metadaten
sind gehasht in der Evidence geführt. Lokale OCI-Digests/Attestationen sind kein
Signaturnachweis. Docker Scout erzeugte CycloneDX-SBOMs; rekursive Komponenten
und Dependency-Referenzen wurden validiert. package.json bleibt 0.1.0; das
lokale Build-Label 1.0.0-rc.1 wurde explizit gesetzt.

## Finale Runtime-, Content- und Secret-Gates

Worker Image Content Gate: **PASSED**. linux/amd64, User meterwerk, WorkingDir /app,
ENTRYPOINT node --conditions=react-server, CMD dist/rules-worker.js.
Rules-, Rollout- und MQTT-Bundles vorhanden; Manifest-/Dateihashes passen.
Production-only/file-traced Runtime: 55 Pakete, 445 reguläre Dateien, 59 Symlinks.
Kein tsx, TypeScript-Compiler, Playwright, Prisma CLI, Vitest oder Paketmanager;
keine Projekt-Testdateien, Dependency-Test-/Fixture-Dateien, .env oder Keys.
Kein vollständiger Dev-Workspace. Alle externen Imports aufgelöst; Argon2 nativ bestanden.

| Worker         | Runtime | SIGTERM | Exitcode | Shutdown (ms) | Stop-Log  |
| -------------- | ------- | ------- | -------- | ------------- | --------- |
| rules-worker   | PASSED  | PASSED  | 0        | 595.49        | vorhanden |
| rollout-worker | PASSED  | PASSED  | 0        | 539.39        | vorhanden |
| mqtt-worker    | PASSED  | PASSED  | 0        | 1219.73       | vorhanden |

Je fünf Sekunden Startup-Beobachtung, MQTT subscribed, keine erkannten
Runtimefehler. Dauer umfasst Signalaufruf und Docker-Zustandsabfrage; kein SIGKILL.
Alle Stop-Meldungen sind in der Evidence hinterlegt.

Web Runtime: **8/8 PASSED**, tatsächlicher Container ohne Runtime-Ersatzmounts.
Liveness/Readiness, exakter Build-SHA, Login-Seite, synthetischer Login/Dashboard,
API unauthentifiziert 401 und authentifiziert 200. Natives Argon2 hash/verify PASSED.
Web SIGTERM: Exit 143, 599.11 ms, kein OOM/SIGKILL; Restart PASSED.
Der erste Loopback-Anlauf scheiterte vor den Fachchecks am internen Docker-Netz;
interne Readiness war 200. Zusätzliche lokale Bridge nur für Web stellte die
Loopback-Bindung 127.0.0.1:3108 her. Danach 8/8 bestanden. Test-DB/Broker bleiben
im internen Netz. Neu gestarteter Web-Container nach Abschluss gestoppt.

Lease-Recovery **übernommen, PASSED_LOCAL**: alle drei Bundle-SHA-256 stimmen
bytegenau mit ddbedc8 und dem gehärteten Dirty-Image überein:

- rules-worker.js: `4fba35ab80294306a928fb2c8e517a07fce71228203fd96ee8820d3696636432`
- mqtt-worker.js: `4571ff68e72c923128562c65be5937d2d908e6e9b4d67c7a86ebc5d750f550dc`
- rollout-worker.js: `f1e6cb8f9c173659e2ec58d6f3744c90463223af8f849d3eb2dddd528be895db`

Nachweisgrenze: 2 Claims, 1 committed Completion nach Lease-Ablauf, auch nach
Neustart weiterhin 1; keine Exactly-once-Zusage für externe Nebenwirkungen.

Image Secret Gate: **PASSED** für Worker (445 Dateien) und Web (2.854 Dateien):
0 bekannte synthetische Secretwerte, 0 begrenzte Credential-/Private-Key-Muster,
0 Secret-Environmentvariablen im Image, 0 bekannte Secretwerte in Config/History.
Scope: zusammengeführtes /app-Dateisystem einschließlich Binärdateien und
genannte Config-/History-Prüfung; kein vollständiger forensischer Lower-Layer-Scan.
Repository Secret Scan: PASSED, 0 Review-Funde, 18 bekannte Demo-/Template-Werte.

## Dependency Audit und gezielte Regression

Audit vom 29.09.2026 übernommen: Exit 0, **0 Advisories**. package.json und
pnpm-lock.yaml gegenüber 4932f00 unverändert. Lockfile SHA-256:
`ef5e3e0857572d85e27056bee29c93bb5d5bfbbce31024cd8bb1dda4a91efd7a`.
Roh-Audit-Hash ebenfalls verifiziert; keine neue Advisory-Feed-Abfrage behauptet.

PASSED: git diff --check, Prettier für betroffene unterstützte Dateien, ESLint für
betroffene Skripte, Typecheck (tsc --noEmit), Prisma Generate in beiden Linux-Builds,
Worker-Build, Worker Image Static Verification (3 Bundles/4 Stufen/0 Sourcemaps),
16/16 Image-/Lifecycle-/Runtime-Policy-/SBOM-Regressionstests, CI-Konfigurationsprüfung,
Documentation Quality, Referenzen, Secret Scan und Artifact-/Evidence-Verifikation.
Dockerfile wird durch echten Build und Static-Gate geprüft; Prettier hat dafür
keinen Parser. Dokumentationsänderungen werden abschließend erneut geprüft.

Release-Artefaktprüfung: finale Image-IDs, OCI-/BuildKit-Digests, SHA-Labels,
Clean-Manifest, Lockfile-/Bundle-/SBOM-Hashes und Runtime-/Secret-Evidence stimmen
überein. Die zentralen übernommenen lokalen Belege wurden gegen ihre bereits
gespeicherten Hashes geprüft. Alte Windows-ZIP-/Standalone-Pakete sind historische
Belege und werden nicht als finale 1e6589e-Artefakte ausgegeben.

## Übernommene Phase-5v-Gates: PASSED_LOCAL

| Bereich                                  | Ergebnis                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Migrationen                              | canonical baseline 47; Clean Install PASSED; supported v0.4b 7 → 47 PASSED; kein Drift         |
| Unit / Security / Auth                   | 285/285 / 63/63 / 18/18                                                                        |
| DB Acceptance / Field DB / Field Service | 24/24 / 9/9 / 53/53                                                                            |
| Utility / Public API / Webhooks / Rules  | 8/8 / 8/8 / 10/10 / 7/7                                                                        |
| Protocol/Ingestion / HTTP/API Runtime    | 5 PASSED / 84 PASSED                                                                           |
| Browser                                  | 28/28, aus dokumentierten Läufen konsolidiert                                                  |
| Demo                                     | 13 Szenarien, 266 DB-/HTTP-Checks                                                              |
| Web Container historisch                 | Runtime 8/8; SIGTERM/Drain PASSED, In-flight Request 200, 11,90 s Drain, Restart PASSED        |
| Worker historisch                        | Runtime 3/3, SIGTERM 3/3, Lease-Recovery PASSED; Image-Hardening-Blocker geschlossen           |
| Recovery                                 | Web-/Worker-Restart, MQTT-Reconnect, PostgreSQL-Outage/Recovery PASSED; danach API/Browser 7/7 |

[Container-Nachweis](CONTAINER-RUNTIME-DDBEDC8.json),
[breite Suites und Demo](PHASE-5V-RESUME-EVIDENCE.json),
[Unit/Security/Browser](PHASE-5V-PART2-EVIDENCE.json),
[supported Upgrade](SUPPORTED-UPGRADE-V0.4B-4932F00.json),
[gehärteter Worker-Nachlauf](WORKER-IMAGE-5EAE186.json).

Performance übernommen: **210 Samples, 0 Errors**, p50 / p95 in ms:

| Bereich    | p50    | p95    |
| ---------- | ------ | ------ |
| Dashboard  | 366,34 | 516,76 |
| Readings   | 23,95  | 39,88  |
| Analytics  | 42,82  | 93,96  |
| Public API | 32,04  | 43,52  |
| Fleet      | 45,86  | 80,70  |
| Queue      | 1,72   | 2,99   |
| Worker     | 4,49   | 6,78   |

Sequentiell, synthetisch, lokal, leere Worker-Queues; **keine Produktions-Kapazitätsaussage**.
Web-Shutdown-Fristen müssen den belegten Drain >10 s berücksichtigen.

## Explizite Software-Blockerbewertung

| Bisheriger Blocker / Release-Gate                        | Stand  |
| -------------------------------------------------------- | ------ |
| Migration baseline / supported upgrade                   | CLOSED |
| Dependency audit                                         | CLOSED |
| Argon2 Linux runtime / native copying                    | CLOSED |
| Web image / runtime / entrypoint                         | CLOSED |
| Worker runtime / bundled entrypoints                     | CLOSED |
| Worker image dev-artifacts / runtime dependencies        | CLOSED |
| SIGTERM / stop-log verification                          | CLOSED |
| Lease recovery                                           | CLOSED |
| Image SBOM / validator                                   | CLOSED |
| Secret scan                                              | CLOSED |
| Local performance                                        | CLOSED |
| Database recovery                                        | CLOSED |
| MQTT recovery                                            | CLOSED |
| Release artifact verification / immutable provenance     | CLOSED |
| Demo scenario product effects                            | CLOSED |
| Tenant/FK integrity / access-path regressions            | CLOSED |
| Release CI build-dependency installation / configuration | CLOSED |

Keine verbleibenden LOCAL SOFTWARE RELEASE BLOCKER. Windows Application Control
für natives Argon2 bleibt eine Host-Einschränkung; die finale Linux-Runtime ist bestanden.

## EXTERNAL_VALIDATION_PENDING

- Echte CI-Ausführung auf finalem SHA
- Staging Deployment / Promotion
- Signing Verification
- Provider-spezifische Validierung (Scanner, Mail, Webhooks, Storage, MQTT)
- Echtes PITR / Full Restore beim Provider
- HA-/Failover-Test in Produktionsinfrastruktur
- Repräsentative Produktionslast

## HARDWARE_VALIDATION_PENDING

- Reale Stromzähler
- Wasserzähler
- Gaszähler
- Wärmezähler
- Gateways
- Modbus RTU/TCP Hardware
- M-Bus
- Wireless M-Bus
- Pulse
- LoRaWAN
- Herstellerspezifische Geräte

Keiner dieser Punkte wird als bestanden dargestellt oder allein zum lokalen
Softwareblocker umgedeutet. Keine reale Hardware, Kundendaten oder Production-Ressourcen verwendet.
