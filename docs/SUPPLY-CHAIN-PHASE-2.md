# Phase 2: Release Supply Chain und immutable Promotion

## Inventur vor Implementierung

Basis: `d945f8b03059bb1ac1238f469166e6ae5e799fcf`, 30.10.2026.
DONE bedeutet hier ausschließlich vorhandener Mechanismus, keine neue Freigabe.

| Bereich                    | Stand   | Befund                                                                                        |
| -------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| publish-images.yml         | PARTIAL | Quality, drei Builds, Runtime-Smokes, GHCR-Push; keine akzeptierte Digest-Evidence            |
| release.yml                | PARTIAL | Quality, Archive, zwei Image-Smokes; separater Neubau, optionale Scout-SBOM                   |
| ci.yml                     | DONE    | Typecheck, Lint, Format, Unit, Integration, Browser, Build, Audit, Secret Scan                |
| Dockerfiles                | PARTIAL | Drei Rollen, Lockfile, Revision/Version/Zeit-Labels; mutable Basisimages                      |
| Compose                    | PARTIAL | Staging kann Image-Referenzen konsumieren; Production-Datei enthält Builds und Pilot-Defaults |
| Artifact-Erzeugung         | PARTIAL | Standalone-Tar, Worker, Checksummen; Source-Status zu spät erfasst                            |
| SBOM                       | PARTIAL | Transitive CycloneDX-Lockfile-SBOM; Image-SBOM optional, Migration fehlt                      |
| Image-Labels               | PARTIAL | Revision, Version, Zeit, Basisname; kein Source-Label                                         |
| GHCR-Publishing            | PARTIAL | Drei getestete lokale Images, SHA-Tags; keine Registry-Digest-Abnahme                         |
| Digest-Verwendung          | OPEN    | Kein verpflichtendes Promotionmanifest                                                        |
| Release Metadata           | PARTIAL | SHA, Version, Lockfile, Audit; Images und Signing Platzhalter                                 |
| Artifact-Verifier          | PARTIAL | Inventar, Graph, Hashes, Syntax; keine verpflichtende Image-Security-Evidence                 |
| Security/Audit             | PARTIAL | Source-Audit und Regression; keine finalen Image-CVE-/Malware-Gates                           |
| Dependabot/Renovate        | OPEN    | Keine Konfiguration                                                                           |
| Signatur/Attestation       | OPEN    | Kein belastbarer Workflow                                                                     |
| Wiederkehrende Image-Scans | OPEN    | Kein Schedule und keine unterstützte Digest-Liste                                             |

## Festgestellte Rahmenbedingungen

- Repository-API bestätigt `Florian1518/Meterwerk` als öffentlich. GitHub
  Attestations sind für öffentliche Repositories verfügbar; private Repositories
  erfordern Enterprise Cloud. Es wird kein ungeprüfter Plan-Fallback behauptet.
- Phase-1-Evidence bestätigt fehlendes Docker Scout auf dem Runner. Ein fehlendes
  Tool darf in Phase 2 keinen erfolgreichen Gate-Status erzeugen.
- `generate-dependency-audit.mjs` überschreibt eine versionierte Acceptance-Datei;
  `release-artifact.mjs` erfasst den Git-Status erst nach Artefakterzeugung.
- Der bestehende Workflow-Security-Verifier verbietet bisher sämtliche
  Registry-Schreibrechte außerhalb des manuellen Publish-Workflows. Änderungen
  daran müssen die begrenzte neue Release-Autorisierung explizit prüfen.
- RC7 bleibt `15fb7c070f3671cce6d19faca1286f6fd2ee1851`. Keine Tags, Deployments,
  Production-Verbindungen oder Hardwareaktionen gehören zu dieser Phase.

Quellen: [GitHub Attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations),
[Syft](https://oss.anchore.com/docs/installation/syft/),
[Grype](https://github.com/anchore/grype),
[ClamAV](https://github.com/Cisco-Talos/clamav).

## Abnahme

TEILWEISE IMPLEMENTIERT; Freigabe offen. CI Run 41020977994 für Commit 51a703b722f6c4f7b1da8443166167eb5b47d523 ist grün. Release Candidate Run 41020984252 blockierte im finalen Image-/Datei-Scan: Migration meldete 0 gescannte Dateien, außerdem fanden Grype-Reports High-Pakete. Die uncommitteten Korrekturen entfernen globale Paketmanager und Dev-Abhängigkeiten aus den finalen Runtimes und scannen das kopierte finale Dateisystem. Neuer Linux-Release-Run und akzeptiertes Evidence-Artifact stehen aus. Keine Production-Freigabe.

Lokale Prüfung am 30.10.2026: 45 Node-Tests für Manifest, Image-Policy, Source-State und Staging sowie 52 Supply-Chain-Vitest-Tests bestanden; zusätzlich 11 Staging-Admin-Tests. Typecheck, Lint, Format, Production Build, 77 Security-Regressionstests, Secret Scan (0 Review-Funde), Dokuchecks und Diff-Check bestanden. Integration auf isolierter Demo-DB: 18 Zugriffstests, 8 CSV-Import-, 6 Datenqualitätstests und 7 Rules-Checks bestanden. Alle 560 Unit-Testfälle bestanden; der Gesamtlauf endete dennoch mit Fehler beim Windows-EPERM-Cleanup einer Embedded-Postgres-Testsuite. Kein lokaler Docker-Daemon. CI 41020977994 war grün; Release 41020984252 blockierte im finalen Malware-/Vulnerability-Scan. Fixes warten auf autoritative Linux-Image-Gates.

## Releasevertrag

Der manuelle Release delegiert an den gemeinsamen Publish-Workflow mit allen
Quality-Gates. Jede Rolle wird einmal gebaut, getestet und veröffentlicht. Pull
und Image-ID-Vergleich binden den Registry-Digest an das getestete lokale Image.
SHA-Tags sind Kandidaten, keine Freigabe. Das Manifest bindet Source-SHA, Version,
Buildumgebung, UTC-Zeit, Run/Attempt, drei Digests und sämtliche Evidence-Hashes.
GitHub OIDC/Sigstore signiert Image-Provenance, CycloneDX-SBOMs, Web-Archiv und
abschließend das Manifest. Erst nach kryptografischer Prüfung wird das
`release-artifact` hochgeladen. Fehlerberichte sind separat, keine Freigabe.

```sh
node scripts/verify-promotion.mjs ./downloaded-release APPROVED_SHA 1.0.0-rc.7 ./promotion.env
docker compose --env-file ./promotion.env -f compose.promotion.yaml config
```

Der Verifier erzwingt den vom Aufrufer vorgegebenen SHA und die Version, alle
Pflichtfelder/Hashes, SBOM-Zuordnung, Security-Policy und Signaturen mit festem
Repository, Workflow und OIDC-Issuer. Er schreibt nur Digest-Referenzen. Der
zweite Befehl rendert ausschließlich Konfiguration. Keine Builds oder Deploys.
Umgebungssecrets, Netzwerke und Volumes bleiben ein gesonderter Betreiberlayer.
Das alte `compose.production.yaml` ist kein freigegebener Promotionpfad;
Production-Runtime-Parität bleibt offen. Der normale Artifact-Verifier verlangt
die vollständige Signatur-Evidence. `--pre-image` ist ausschließlich vorbereitende
Archivprüfung und kann keinen Release freigeben.

## Source-Evidence und Buildinputs

Direkt nach Checkout werden HEAD, Git-Tree, UTC-Zeit, Anzahl und SHA-256 des
Porcelain-Status in RUNNER_TEMP erfasst. Dateinamen und Diffs werden nicht
exportiert. Dirty Source blockiert CI. Generierter Audit und SBOM liegen im
ignorierten Outputverzeichnis; kein hartcodiertes clean. Die signierte
Manifestprovenance bindet die Source-Evidence an den Workflow.

Action-SHAs, Node-Basisimage und ClamAV-Image sind unveränderlich gepinnt; Syft
und Grype werden als feste Archive gegen eingecheckte SHA-256 geprüft. Lockfile
und pnpm-Pin bleiben erhalten. Ein bitidentischer Neubau wird wegen Buildzeit,
Framework-Build-IDs und dynamischer Security-Datenbanken nicht behauptet.
Die Promotion verwendet exakt dieselben Bytes ohne Neubau.

## SBOM und Vulnerability-Policy

Syft 1.55.0 erzeugt native Inventare aus `registry:image@digest` und daraus
CycloneDX JSON. Beide tragen dieselbe Digest-Zuordnung und werden gehasht;
CycloneDX wird auf den Image-Digest attestiert. Bestehende CycloneDX-Prüfungen
werden wiederverwendet. Fehlendes Syft ist ein Fehler, kein Scout-Skip.

Grype 0.121.0 scannt die finalen Digests mit aktueller Datenbank. Critical, High
und Unknown blockieren unabhängig von verfügbaren Fixes. Medium/Low/Negligible
bleiben im Bericht sichtbar. Keine Ausnahmen, kein globales Ignore und kein
`only-fixed`. Eine spätere Ausnahme benötigt eine überprüfte Policyänderung mit
CVE, Paket/Version, Digest, Begründung, Verantwortlichem und Ablaufdatum.

## Malware-Policy

ClamAV 1.5.4 aktualisiert Signaturen verpflichtend via FreshClam. Version samt
Definitionsstand, Definitionshash, UTC-Zeit, Subject und Scananzahl werden
erfasst. Das gesamte auslieferbare Versionsverzeichnis einschließlich Web-Tar
und Workerdateien wird vor Freigabe gescannt. Container werden ohne Ausführung
in ein isoliertes temporäres Verzeichnis kopiert; ClamAV prüft jede Datei des
finalen zusammengeführten Dateisystems.
Historische gelöschte Layer und Laufzeitverhalten sind nicht Gegenstand dieser
Dateisignaturprüfung. Es wird keine Malwarefreiheitsgarantie behauptet.

Treffer, Fehler, fehlende Definitionen, leere Scans und überschrittene Limits
blockieren. `alert-exceeds-max` verhindert stilles Überspringen großer Inhalte.
Keine False-Positive-Ausnahmen. Berichte enthalten keine Dateiinhalte oder
Umgebungssecrets. Die Archivprüfung sucht zusätzlich bekannte synthetische
Testcredentials. `image-security-evidence` enthält auch fehlgeschlagene Scans.

## Wiederkehrender Prozess

`image-vulnerabilities.yml` ist täglich um 06:23 UTC und manuell vorgesehen.
`infra/supported-releases.json` benennt unterstützte Release-Lanes. Pro Lane wird
der letzte erfolgreiche offizielle Release-Run geladen, dessen SHA und Artifact
vollständig verifiziert und ausschließlich dessen Digests erneut gescannt.
Fehlende Releases, abgelaufene Artefakte und Tool-/Netzwerkfehler sind Fehler.
Berichte werden als `recurring-image-vulnerabilities` 90 Tage archiviert.

Ein fehlgeschlagener Actions-Lauf informiert die bestehenden Workflow-Abonnenten;
Summary/Errorannotation verweisen Operations auf die Evidence. High/Critical/
Unknown müssen als Security-Incident triagiert werden: weitere Promotion stoppen,
betroffene CVEs/Digests im vorhandenen Incidentprozess erfassen, Fix bewerten und
neuen getesteten Kandidaten erzeugen. Medium/Low kommen in den nächsten Review.
Keine automatischen externen Nachrichten, keine Production-Änderungen.

GitHub aktiviert Schedules nur auf dem Defaultbranch. Auf dem Phase-2-Branch
ist Cron noch nicht aktiv. Defaultbranch-Übernahme und Notification-Abonnement
sind explizite Betriebsaktivierungsschritte. Vor Ablauf der Retention müssen
unterstützte Release-Evidence und Sigstore-Bundles dauerhaft archiviert werden;
fehlende Evidence blockiert die nächste Prüfung.
