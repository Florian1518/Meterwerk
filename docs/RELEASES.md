# Releases

Versionen folgen SemVer (`MAJOR.MINOR.PATCH`); Vorabversionen verwenden etwa `-rc.1`. Paketversion steht in `package.json`. Changelog-Einträge werden künftig unter `Unreleased` gesammelt und zum Release kategorisiert, ohne frühere Entwicklungshistorie nachträglich zu erfinden.

## Prüf- und Promotion-Ablauf

CI prüft frozen-lockfile Installation, Prisma-Validierung/Generierung, TypeScript, Lint, Format, Tests, Audit, Secret Scan und Build. Release Workflow kann per Tag oder manuell gestartet werden, ruft CI auf, baut Release-Artefakt und SBOM und lädt ein befristet gespeichertes Artefakt hoch. GitHub Actions verwenden minimale Permissions und gepinnte Actions.

Release Candidate: erfolgreichen CI-Lauf und SHA bestimmen, RC-Artefakt unveränderlich bauen, anschließend in isoliertem STAGING deployen. Migration, Readiness, Worker-Status, Smoke-/E2E-Tests, Security Guards und Demo Acceptance dokumentieren. Promotion ist eine manuelle Freigabeentscheidung. Der vorhandene Workflow deployt weder Staging noch Produktion automatisch; Produktionsrelease erfordert explizite externe Freigabe und separates Deployment.

`pnpm release:gate` prüft Release-Metadaten; `pnpm sbom` generiert die Software-Komponentenliste. SBOM bedeutet nicht, dass Artefakte signiert oder Provenance attestiert sind. Signierung darf nur behauptet werden, wenn sie in der jeweiligen Release-Infrastruktur eingerichtet und geprüft wurde.

## Vor Freigabe

- Changelog und Versions-/Git-SHA stimmen.
- CI und Security Gates sind grün; Findings dokumentiert.
- Migration und Backupstrategie geprüft.
- Staging Readiness, Demo Acceptance, Smoke und E2E erfolgreich bzw. Abweichung ausdrücklich freigegeben.
- Rollback-Grenzen, Worker-Kompatibilität und Betriebsverantwortung geklärt.
- Production Release wird manuell und getrennt ausgelöst.

Details: [Release Checkliste](RELEASE-CHECKLIST.md), [Deployment](DEPLOYMENT.md), [Upgrade](UPGRADE.md), [Rollback](ROLLBACK.md), [Staging](STAGING.md).
