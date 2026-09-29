# Releases

Versionen folgen SemVer (`MAJOR.MINOR.PATCH`); Vorabversionen verwenden etwa `-rc.1`. Paketversion steht in `package.json`. Changelog-Einträge werden künftig unter `Unreleased` gesammelt und zum Release kategorisiert, ohne frühere Entwicklungshistorie nachträglich zu erfinden.

## Prüf- und Promotion-Ablauf

CI prüft frozen-lockfile Installation, Prisma-Validierung/Generierung, TypeScript, Lint, Format, Tests, Audit, Secret Scan und Build. Release Workflow kann per Tag oder manuell gestartet werden, ruft CI auf, baut Release-Artefakt und SBOM und lädt ein befristet gespeichertes Artefakt hoch. GitHub Actions verwenden minimale Permissions und gepinnte Actions.

Release Candidate: erfolgreichen CI-Lauf und SHA bestimmen, RC-Artefakt unveränderlich bauen, anschließend in isoliertem STAGING deployen. Migration, Readiness, Worker-Status, Smoke-/E2E-Tests, Security Guards und Demo Acceptance dokumentieren. Promotion ist eine manuelle Freigabeentscheidung. Der vorhandene Workflow deployt weder Staging noch Produktion automatisch; Produktionsrelease erfordert explizite externe Freigabe und separates Deployment.

`pnpm release:gate` prüft bei gesetztem `RELEASE_GATE_URL` Readiness und Build-Info per HTTP; ohne URL überspringt es die Remoteprüfung. Das ist keine Gesamtfreigabe. `pnpm sbom` generiert eine transitive Lockfile-Komponentenliste. SBOM bedeutet nicht, dass Artefakte signiert oder Provenance attestiert sind. Signierung darf nur behauptet werden, wenn sie in der jeweiligen Release-Infrastruktur eingerichtet und geprüft wurde.

## Lokale Vorbereitung auf e88b1de

Nach einem erfolgreichen Build erzeugen `pnpm sbom` und
`node scripts/release-artifact.mjs` unter `release-artifacts/<Version>/` ein
Web-Tar, drei Worker-Bundles, SBOM, Metadaten und SHA-256-Prüfsummen.
RELEASE_VERSION muss für beide Schritte identisch sein. Das Paket enthält
Migrationen und den Migrationspreflight, keine `.env` oder privaten Schlüssel.
`node scripts/verify-release-artifact.mjs` prüft Inventar, SBOM-Referenzen,
Worker-Syntax und Checksummen; lokale Acceptance-Ausgabe benötigt `.local/acceptance/`.

Der Web-Build benötigt passende installierte Lockfile-Dependencies und startet
über `next start`; Worker-Bundles benötigen Node mit `--conditions=react-server`
und installierte Dependencies. Die lokale Windows-Verpackung ist kein portables
Containerimage. Der vorhandene Build wurde wiederverwendet, nicht erneut gebaut.
Metadata trennt SHA, Dirty-Status, Build-ID, Plattform und Signing-Status.
Signierung bleibt `NOT_CONFIGURED_NOT_VERIFIED`; Container-Image-Build und
Staging bleiben offen. Das entpackte lokale Windows-x64-Webpaket besteht
Health-/Readiness-/Login-Smoke, belegt aber keine Container- oder
plattformübergreifende Runtime. Siehe [Fortsetzungsbericht](acceptance/PHASE-5V-RESUME.md).

## Vor Freigabe

- Changelog und Versions-/Git-SHA stimmen.
- CI und Security Gates sind grün; Findings dokumentiert.
- Migration und Backupstrategie geprüft.
- Staging Readiness, Demo Acceptance, Smoke und E2E erfolgreich bzw. Abweichung ausdrücklich freigegeben.
- Rollback-Grenzen, Worker-Kompatibilität und Betriebsverantwortung geklärt.
- Production Release wird manuell und getrennt ausgelöst.

Details: [Release Checkliste](RELEASE-CHECKLIST.md), [Deployment](DEPLOYMENT.md), [Upgrade](UPGRADE.md), [Rollback](ROLLBACK.md), [Staging](STAGING.md).
