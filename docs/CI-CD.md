# CI/CD

Der aktuelle Stand nach RC-Commit `84ce62c` ist im
[CI-/Staging-Bereitschaftsbericht](acceptance/CI-STAGING-READINESS-84CE62C.md)
dokumentiert. Actions sind gepinnt und Berechtigungen lesend; ein Remote-CI-Lauf
ist mangels Git-Remote nicht möglich. Der aktuelle lokale
`pnpm audit --audit-level high` schlägt wegen eines kritischen Next.js-Advisory
fehl. CI ist damit derzeit nicht vollständig grün.

Die GitHub-Actions-Pipeline läuft bei Push und Pull Request. Sie trennt Fast Checks, Unit Tests, Integration/Migrationen, Browser-/Mobile-Tests und den Produktionsbuild. Pflichtstufen schlagen bei Fehlern fehl.

## Services und Migrationen

Die Integrationsstufe startet PostgreSQL 16 und einen Mosquitto-Service. Sie wendet alle versionierten Prisma-Migrationen auf der frischen Testdatenbank an und führt `test:integration` aus. Lokal kann dies wegen `P1001`/`ECONNREFUSED` übersprungen werden; dann ist die Stufe nicht bestanden. Produktionsmigrationen werden nie automatisch aus CI ausgeführt.

## Browser und Artefakte

Playwright deckt Desktop, Mobile, Mobile Landscape und Tablet ab. Bei Fehlern werden zeitlich begrenzte Testartefakte hochgeladen. Keine `.env`, Tokens oder Produktionsdaten sind als Artefakte erlaubt.

## Qualität und Sicherheit

Pflicht-Gates sind Prisma validate/generate, Typecheck, ESLint, Prettier, Unit-/Integrationstests, Migration Check, Security-/Dependency-Audit und Produktionsbuild. `pnpm audit --audit-level high` meldet bekannte Schwachstellen; automatische destruktive Upgrades gibt es nicht. Secret Scan und Dependency Review können als Repository-Schutzregeln ergänzt werden.

## Build-Metadaten

`/api/system/build-info` stellt Version, Git-Commit, Build-Zeitpunkt und Environment bereit. Werte stammen ausschließlich aus nicht geheimen CI-Umgebungsvariablen.
