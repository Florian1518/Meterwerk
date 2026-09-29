# Releases

Versionen folgen SemVer (`MAJOR.MINOR.PATCH`); Vorabversionen verwenden etwa `-rc.1`. Paketversion steht in `package.json`. Changelog-Einträge werden künftig unter `Unreleased` gesammelt und zum Release kategorisiert, ohne frühere Entwicklungshistorie nachträglich zu erfinden.

## Prüf- und Promotion-Ablauf

Die Workflows verwenden statisch geprüfte, gepinnte Actions, `contents: read`,
`persist-credentials: false`, pnpm 12.5.1 und frozen-lockfile Installation. CI
enthält Prisma-Validierung/Generierung, Typecheck, Lint/Format, Unit-,
Integrations-, Security- und Browser-Tests, Audit, Secret Scan und Build. Das
Release-Workflow baut SBOM und Release-Artefakt und lädt dieses befristet hoch.
Aktuell fehlen darin ein Dokumentations-Gate sowie der Aufruf des Artefakt-
Verifiers. Der Workflow wurde für den WIP-SHA `a873a87` nicht ausgeführt; die
statische Prüfung ist `CONFIG_VERIFIED`, nicht `CI PASSED`.

Release Candidate: erfolgreichen CI-Lauf und SHA bestimmen, RC-Artefakt unveränderlich bauen, anschließend in isoliertem STAGING deployen. Migration, Readiness, Worker-Status, Smoke-/E2E-Tests, Security Guards und Demo Acceptance dokumentieren. Promotion ist eine manuelle Freigabeentscheidung. Der vorhandene Workflow deployt weder Staging noch Produktion automatisch; Produktionsrelease erfordert explizite externe Freigabe und separates Deployment.

`pnpm release:gate` prüft bei gesetztem `RELEASE_GATE_URL` Readiness und Build-Info per HTTP; ohne URL überspringt es die Remoteprüfung. Das ist keine Gesamtfreigabe. `pnpm sbom` generiert eine transitive Lockfile-Komponentenliste. SBOM bedeutet nicht, dass Artefakte signiert oder Provenance attestiert sind. Signierung darf nur behauptet werden, wenn sie in der jeweiligen Release-Infrastruktur eingerichtet und geprüft wurde.

## Lokale Artefaktabnahme auf `a873a87`

Für `a873a87fbce94f2f8f547343e8347a1507c80ba0` wurden Production Build,
Lockfile-SBOM, Web-Tar, drei Worker-Bundles, Metadaten und sechs SHA-256-
Prüfsummen neu erzeugt. Der Verifier prüfte 2.855 Archiv-Einträge; das Paket
enthält das Windows-x64-Argon2-Binding. Der entpackte Standalone-Smoke bestand
4/4 Prüfungen auf Loopback. Messwerte und Hashes stehen im
[Artefaktnachweis](acceptance/RELEASE-ARTIFACT-A873A87.json). Das Paket ist
Windows-x64-spezifisch, hat Paketversion `0.1.0` und Zielversion `1.0.0`; es ist
kein finales RC-Artefakt.

Web- und Worker-Images wurden nicht gebaut, weil der Docker-Desktop-Linux-Daemon
nicht erreichbar war. Statische Prüfung fand im Worker-Dockerfile `tsx` als
Laufzeitaufruf aus den Dev-Dependencies sowie ungefiltertes `node_modules` im
Runtime-Image. Dieses Image-Gate bleibt bis zur Korrektur und echtem Build offen.
Provenance enthält SHA, Build-Zeit, SBOM und Prüfsummen; tatsächliche Signatur
und Verifikation fehlen (`SIGNING_PREPARED_NOT_VERIFIED`). Staging bleibt
`EXTERNAL_VALIDATION_PENDING`.

## Vor Freigabe

- Changelog und Versions-/Git-SHA stimmen.
- CI und Security Gates sind grün; Findings dokumentiert.
- Migration und Backupstrategie geprüft.
- Staging Readiness, Demo Acceptance, Smoke und E2E erfolgreich bzw. Abweichung ausdrücklich freigegeben.
- Rollback-Grenzen, Worker-Kompatibilität und Betriebsverantwortung geklärt.
- Production Release wird manuell und getrennt ausgelöst.

Details: [Release Checkliste](RELEASE-CHECKLIST.md), [Deployment](DEPLOYMENT.md), [Upgrade](UPGRADE.md), [Rollback](ROLLBACK.md), [Staging](STAGING.md).
