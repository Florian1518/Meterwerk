# Phase 5v — Fortsetzung von Checkpoint 943d23f

Stand: 01.10.2026. Ausgangs-HEAD `943d23ff2c6fc0891e09b61a329721f9e55060b7`,
Branch `master`, Arbeitsbaum anfangs clean. Keine RC-Freigabe, kein Commit,
Tag, Push oder Deployment in dieser Fortsetzung.

## Tatsächlicher Unterbrechungspunkt

Der vollständige Checkpoint-Diff umfasst 25 Dateien. Er enthält bereits den
Worker-Bundle-Build, Produktionsabhängigkeiten im Worker-Image, Node-Entrypoints,
Lifecycle-Code, statische Image-Prüfung, Container-Smokes, CI-Gates und
SBOM-/Audit-Provenance. Diese Implementierungen wurden nicht erneut erstellt.

Letzte lokale Belege vom 29.09.2026 unter `.local/acceptance/`:

| UTC      | Beleg                                    | Ergebnis                                                                                |
| -------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| 14:05:36 | `rules-worker-integration.json` / `.log` | Exit 0, 7 Rules-Checks                                                                  |
| 14:06:04 | `standalone-runtime-smoke.json` / `.log` | Exit 0, 4 Runtime-Smokes                                                                |
| 14:14:31 | `resume-artifact-results.json`           | PASSED, 750 Komponenten, 751 Graphknoten, 2.855 Archiveinträge, 8 Prüfsummen, 3 Bundles |
| 14:15:35 | `lifecycle-rules-rollout.json` / `.log`  | Exit 1; Windows-SIGTERM ohne auswertbaren kontrollierten Shutdown                       |

Der Commit folgte um 14:24:20 UTC (16:24:20 Europe/Berlin). Der letzte
nachweisbare Lauf war der fehlgeschlagene Lifecycle-Versuch. Die genaue letzte
Chataktion ist nicht gespeichert. Der erste offene Bereich ist die tatsächliche
Linux-Image-/Lifecycle-Abnahme; danach folgen die weiteren Release-Gates.

Das vorhandene Release-Paket nennt `edda8674d9c2671bae0844ee8a5b205a5e224da9`,
`workingTree=dirty`, Version `0.1.0`, Windows x64. Es ist kein unveränderliches
Artefakt von `943d23f`. Sein Signing-Wert ist `NOT_CONFIGURED_NOT_VERIFIED`;
der Checkpoint-Code setzt bei künftigen Paketen `SIGNING_PREPARED_NOT_VERIFIED`.
Keiner der Werte belegt eine Signatur. Alte Artefakte wurden nicht umetikettiert.

## Gezielte Weiterarbeit

`docker --context desktop-linux version` endet erneut mit Exit 1: CLI 29.8.0
vorhanden, lokale Pipe `dockerDesktopLinuxEngine` fehlt. Kein Image gebaut oder
gestartet. `git remote` ist leer; kein Actions-Lauf wurde gestartet.

Vier konkrete Fehler im noch nicht ausgeführten Image-Pfad wurden korrigiert:

1. Der Argon2-Kopierhelfer exportierte nur eine Funktion; der Dockerfile-
   CLI-Aufruf tat nichts. Ein geschützter CLI-Einstieg ruft sie jetzt auf.
2. Web-Smoke und Dockerfile hatten keinen übereinstimmend festgelegten
   Entrypoint. Beide verwenden jetzt ausdrücklich `node` / `server.js`.
   Der Dependency-Stage erhält auch `pnpm-workspace.yaml` mit Installationsregeln.
3. Rules/Rollout melden `<worker> stopped`, der Smoke erwartete ausschließlich
   `worker.stopped`. Die Prüfung akzeptiert jetzt die passenden Meldungen und
   verlangt zusätzlich einen beendeten Container mit Exitcode 0.
4. Der Release-Job installiert trotz `NODE_ENV=production` ausdrücklich die
   erforderlichen Build-Abhängigkeiten durch `--prod=false`.

Neue Regression: **5/5 Tests, 0 Fehler**, im CI-Fast-Gate eingebunden. Der echte
Argon2-CLI-Aufruf kopiert in ein frisches temporäres Verzeichnis; Lockversion und
Binärhash stimmen. Lifecycle-Tests prüfen die drei Meldungen und verweigern
Exit 137, laufende Prozesse und fehlende Shutdown-Meldungen. Dies ist kein
Linux-Signal- oder Containerlauf. Gezieltes ESLint auf sechs JS-Dateien und
CI-Statikprüfung: Exit 0. Betroffene Image-Statikprüfung: PASSED, 4 Stages,
317 Produktionspakete, 3 Bundles, 0 Source Maps.

Abschlussprüfungen: Dokumentationslinks 95 Markdown-Dateien, 13 Pflichtreferenzen,
Secret Scan 0 Review-Funde / 18 bekannte Demo-/Vorlagenwerte, jeweils Exit 0.
Formatierung der geänderten Skripte/Workflows/Dokumente und `git diff --check`
bestanden. Alte Produkttests, Build, Audit und Performance wurden nicht wiederholt.

## Übernommene Nachweise

Produktcode, Prisma-Schema und Lockfile bleiben unverändert. Dokumentiert und
nicht erneut ausgeführt: 285 Unit, 63 Security Unit, 24 DB-Acceptance, 9 Field-DB,
18 Auth-, 8 Import-, 6 Quality-, 7 Rules- und 84 HTTP-Checks; 13 Szenarien mit
266 Checks; 44 Produktpfad-Checks; 2 Demo-Browserfälle, 2 PWA-Fälle und 1 mobile
Field-Service-Journey. Die früheren 28 Browserfälle stammen aus getrennten
Läufen. Clean Install 47 und unterstütztes Upgrade 7→47 sind belegt.
Performance: 210 sequenzielle Messungen, 0 Fehler; Audit: 765 Dependencies,
0 Advisories laut unverändertem Lockfile-Beleg.

Der Checkpoint dokumentiert zusätzlich Generate, Typecheck, Lint, Format,
Production Build (69 Seiten), 5 Rules-Unit-Tests und Image-Statikprüfung.
Dies sind übernommene Ergebnisse; die zuletzt ausgelesenen Rohbelege stehen
gesondert oben. Kein neuer Anwendungscode erfordert hier einen vollständigen
Produktregressionslauf. Ein frischer Linux-Image-Build bleibt verpflichtend.

## Offene Gates

Die vier gefundenen Softwarefehler sind lokal korrigiert und gezielt geprüft.
Daraus bleibt kein bekannter `SOFTWARE RELEASE_BLOCKER`; eine vollständige
Image- oder RC-Freigabe wird daraus nicht abgeleitet.

- Lokales Image-Gate: Linux-Web-/Worker-Build, native Argon2-Runtime,
  Login/Readiness, Start und kontrollierter Shutdown aller drei Worker,
  Image-IDs/Digests und Image-SBOM fehlen weiterhin.
- Signing: keine konfigurierte Signing-Identität, keine erzeugte/verifizierte
  Signatur. Checksummen und lokale Provenance ersetzen dies nicht.
- CI/Staging: tatsächlicher CI-Lauf auf unveränderlichem SHA, getrenntes
  Staging und finale RC-Acceptance fehlen. Version und finale Artefakte müssen
  später zu diesem SHA passen.
- Failover: Worker-Neustart/Lease-Reclaim, Web-Neustart, MQTT-Reconnect und
  DB-Ausfall fehlen. Sequenzielle lokale Performance belegt keine HA/Kapazität.
- `EXTERNAL_VALIDATION_PENDING`: Containerumgebung derzeit nicht verfügbar;
  CI, Staging, Signing, Mail/Webhooks/Storage/MQTT-Provider, Scanner, PITR,
  vollständiger Restore-Drill, Monitoring und Betriebs-Failover.
- `HARDWARE_VALIDATION_PENDING`: physische Zähler, Gateways, Bus-/Funkadapter
  und Herstellergeräte. Keine Hardware, Production oder Kundendaten verwendet.

Nächster Punkt bleibt die tatsächliche lokale Linux-Image-Abnahme. Ein weiterer
WIP-Checkpoint ist sinnvoll; ein finaler v1.0-RC-Commit ist es nicht.
