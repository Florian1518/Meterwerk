# Phase 5v – Worker-Image-Nachlauf

Stand: 02.10.2026, HEAD `5eae186d4024e3b3720121be35d0a4dc88634ef7`, Branch
`master`, bestehende uncommittete Änderungen erhalten. Kein Commit, Push, Tag
oder Deployment. [Maschinenlesbare Evidence](WORKER-IMAGE-5EAE186.json).

## Rekonstruierter Abbruchpunkt

Letzter dauerhaft belegter Vorgang: erfolgreicher Worker-Build am 01.10.2026
von 12:50:49.933 bis 12:51:57.574 UTC, Exit 0. Die genaue letzte interaktive
Worker-Aktion ist ohne das damalige Gesprächsprotokoll nicht beweisbar.
Build-Provenance, Logs und vorhandene Tags belegen jedoch den Abschluss von
Punkt 7. Für Inspection/Runtime des neuen Images gab es beim Fortsetzen keine
Ergebnisdatei; das Acceptance-Script war vorbereitet. Erster offener Punkt: 8.

Punkte 1–7 waren bereits implementiert: Ursachenanalyse, Runtime-Modell,
Package-Klassifizierung, Deployment-Pruning, Dockerfile, Fixture-Policy und
Linux-Build. Ein erster Build war fehlgeschlagen; danach existierten zwei
erfolgreiche Tags, zuletzt `acceptance-5eae186-runtime-20261001t125049z`.
Alle sieben protokollierten Build-Eingaben stimmen bytegenau mit dem Arbeitsbaum
überein. Kein Neubau war erforderlich. Das CI-Content-Gate war bereits
verdrahtet; seine Regression und die Acceptance-Dokumentation waren noch offen.
Alte Runtime-/Lease-/SBOM-Belege gehören zum Image `meterwerk-worker:ddbedc8`.

## Ursache und Deployment

Im eingefrorenen Lockgraphen wurden optionale Peer-Kanten zu optionalen
Dependencies: `@prisma/client → prisma/typescript`, `next → @playwright/test`.
Der reine Production-Install nahm sie mit. Prisma CLI, TypeScript und
Playwright sind in package.json bereits Dev-Dependencies; kein Umklassifizieren
und kein Lockfile-Eingriff waren nötig. Stattdessen deployt der vorhandene
File-Tracer ausschließlich die benötigten Runtime-Dateien der drei Bundles.
Lizenzhinweise bleiben erhalten. Unbekannte Trace-Warnungen brechen den Build ab;
bekannte optionale Plattform-/Beschleunigeralternativen sind dokumentiert.

55 Runtime-Pakete, 445 reguläre Dateien und 59 Symlinks. Native Argon2-Prüfung,
alle externen Imports, Manifest-/Bundle-Hashes bestanden. Kein tsx, TypeScript,
Playwright, Prisma CLI oder Projekt-Testartefakt im Runtimebaum. Auch keine
verbleibenden Dependency-Test-/Fixture-Dateien; keine wurden blind gelöscht.
Im alten Image lagen 309 Test-/Spec-Dateien aus Dependencies, insbesondere
Zod (196), find-my-way (74), fast-uri (21), Next (6), pg-protocol (4) und
weiteren durch Prisma CLI hereingezogenen Paketen. Dies waren keine Projekt-Tests.

## Ergebnis für das vorhandene neue Image

Tag: `meterwerk-worker:acceptance-5eae186-runtime-20261001t125049z`.
Image-ID und RepoDigest:
`sha256:3308d24fbad17168593094822eba41e15ea31c7725cf2ae96402d50fe1167a93`.
Linux/amd64, User `meterwerk`, Entrypoint `node --conditions=react-server`.
Build ist ausdrücklich `dirty`, kein unveränderlicher finaler Release-Commit.

| Worker  | Runtime | SIGTERM | Dauer     | Exitcode |
| ------- | ------- | ------- | --------- | -------- |
| Rules   | PASSED  | PASSED  | 362,12 ms | 0        |
| Rollout | PASSED  | PASSED  | 358,27 ms | 0        |
| MQTT    | PASSED  | PASSED  | 551,05 ms | 0        |

Jeweils fünf Sekunden Startup-Beobachtung, passende Startup-/Shutdown-Meldung,
MQTT-Subscription und keine erkannten Runtimefehler; kein erzwungenes Stoppen.
Nur vorhandene isolierte Test-DB/Testbroker wurden wieder gestartet.
Keine echten Nachrichten oder Hardwareverbindungen.

Lease-Recovery wurde nicht wiederholt: alle drei Bundles sind SHA-256-bytegleich
zum alten akzeptierten Image; Fachcode, Lease-Logik, Schema und Lockfile sind
unverändert. Der frühere Beleg bleibt gültig für seinen Scope: eine committed
Completion nach Lease-Ablauf und keine doppelte Completion nach Neustart,
keine Exactly-once-Garantie für externe Effekte. Der neue Image-Lauf prüft die
veränderte Verpackung, ersetzt keine neue Last-/Recovery-Abnahme.

Neue SBOM: `.local/acceptance/worker-clean-image-sbom.cdx.json`, Docker Scout
1.24.0, CycloneDX, 80 Paketkomponenten einschließlich Basisbetriebssystem.
SHA-256 `c698c77c584d8f3531ad129d6b43ff7975e5b089b5081c08f00998fb092232eb`.
Container-PURL stimmt exakt mit der Image-ID überein. Geschachtelte Datei-
Komponenten und sämtliche Dependency-Referenzen wurden validiert. Der Validator
wurde für diese reale Scout-Struktur korrigiert; der Rohbericht blieb unverändert.

Lokale Digest-/Build-Provenance dokumentiert Index-, Plattformmanifest-,
Config-, BuildKit-Attestation- und Base-Digest sowie Eingabe-Hashes. Keine
Signaturprüfung oder signierte finale Release-Provenance behauptet.

Image-Secret-Scan PASSED: 445 Dateien inklusive Binärdateien, keine bekannten
synthetischen Acceptance-Secrets, keine ausgewählten Credential-/Private-Key-
Treffer; Config und History ohne diese bekannten Secretwerte. Keine Secret-
Environmentvariablen im Image. Scope ist das zusammengeführte `/app`-Dateisystem
und diese Config-/History-Prüfung, kein vollständiger forensischer Lower-Layer-Scan.
Repository-Scan: 0 Review-Funde, 18 erkennbare Demo-/Template-Werte. Ein
synthetischer Key-Header im neuen Policy-Test wurde zur Vermeidung eines
Scanner-Fehlalarms aus eindeutig synthetischen Teilen zusammengesetzt.

Größe (`docker image inspect Size`, gleicher Store): 1.225.964.519 → 253.616.229
Bytes, minus 972.348.290 Bytes / 79,31 %. Docker-Content-Size und Disk-Usage
werden nicht mit dieser Metrik vermischt.

## Regression und Audit

16/16 gezielte Tests: 5 Image-/Lifecycle-, 7 Runtime-Policy-, 4 SBOM-Tests.
Nach der reinen Fixture-Anpassung zusätzlich nur die betroffenen 7/7 wiederholt.
Worker-Static-Check: 3 Bundles, 4 Stufen, 0 Sourcemaps; CI-Konfiguration geprüft.
Neue echte SBOM separat mit dem CI-Validator geprüft. ESLint und Formatprüfung
der geänderten unterstützten Dateien sowie Dokumentations- und Diff-Prüfung
werden in der Evidence geführt. Prettier hat keinen Dockerfile-Parser; das
Dockerfile wird durch Static-Gate und vorhandenen Linux-Build geprüft.

package.json und pnpm-lock.yaml sind auch gegenüber dem Audit-Commit `4932f00`
unverändert. Audit-Provenance vom 29.09.2026 wird weiterverwendet: pnpm 12.5.1,
Exit 0, 0 Advisories aller Schweregrade; identischer Lockfile-SHA-256
`ef5e3e0857572d85e27056bee29c93bb5d5bfbbce31024cd8bb1dda4a91efd7a`.
Kein erneuter Dependency Audit. Bereits erfolgreiche vollständige App-Suites,
Web-Build, Migrationen und Performanceprüfungen nicht wiederholt.

## Releasebewertung

Worker-Image-Blocker geschlossen. Keine verbleibenden bekannten SOFTWARE
RELEASE BLOCKER im bisher abgegrenzten lokalen Scope. Lokal bereit für die
finale RC-Bewertung: JA. Finale RC-Freigabe: noch nicht erteilt.

Offene lokale Release-Gates: finale unveränderliche Revision und konsolidierte
Release-Artefakte/Evidence für genau diese Revision; aktuelle Image-Provenance
bezieht sich auf einen Dirty-Arbeitsbaum. Der finale RC-Commit bleibt ausdrücklich
ausgesetzt. CI-Image-Gate ist implementiert und lokal gezielt geprüft;
GitHub Actions wurde nicht gestartet. SBOM-Erzeugung im bestehenden Release-
Workflow bleibt bei fehlendem Docker-SBOM-Plugin bedingt, nicht als bestanden
auszugeben.

EXTERNAL_VALIDATION_PENDING: CI auf finalem SHA, Staging/Promotion,
Signaturprüfung, externe Scanner-/Mail-/Webhook-/Storage-/MQTT-Provider,
HA/PITR/vollständiger Restore und repräsentative Produktionslast.
HARDWARE_VALIDATION_PENDING: physische Zähler, Gateways, Funk-/Busadapter und
Herstellergeräte. Frühere bestandene lokale Recovery-/Performance-Nachweise
bleiben erhalten und werden nicht zu externen Nachweisen umgedeutet.
