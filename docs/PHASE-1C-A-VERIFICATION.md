# Phase 1C-A – Abschlussprüfung

Prüfdatum: 20. Oktober 2026.

## Ausgangspunkt und Umfang

Die Fortsetzung begann mit `git status --short` und `git diff --stat`.
Vorhanden waren elf geänderte versionierte Dateien sowie eine neue Migration,
drei neue Servermodule und ein neuer Datenbanktest. Diese Änderungen wurden
beibehalten. Es wurde nichts zurückgesetzt, gelöscht, committet, gepusht oder
deployt.

Der Sollumfang wurde aus dem vorhandenen Zwischenstand und den Abschnitten
„Gateway-Provisioning-Grundlage (Phase 1C-A)“ in README sowie
„Gateway-Lifecycle und direkte Liegenschaft, Phase 1C-A“ in ARCHITECTURE
rekonstruiert. Ein separater ursprünglicher Phase-1C-A-Auftrag lag dieser
Fortsetzung nicht vor.

## Bereits umgesetzt und geprüft

- Additive Migration `202610190001_gateway_provisioning_foundation`:
  eigener Gateway-Lifecycle, optionale direkte Property, Revision,
  UTC-Meilensteine und öffentliches Kommunikationsidentitätsinventar.
- Keine automatische Zuordnung oder Aktivierung von Bestandsdaten;
  historische Installationsdaten bleiben unverändert erhalten.
- Selbst authentifizierende Lifecycle-, Property- und Identitätsdienste:
  SUPER_ADMIN, expliziter Mandant, strikte Validierung und atomarer Audit.
- Zentrale Übergangsregeln, Revisionskonflikte, idempotente Zielzustände und
  Sperre neuer ACTIVE-Übergänge bis zur Readiness-Prüfung in Phase 1C-B.
- Mandantengesicherte Property-Fremdschlüssel und transaktionale
  Gateway-/Device-/Meter-Zuordnungsprüfungen einschließlich Legacy-NULL.
- Schutz der CRUD-, Modbus- und Importpfade gegen ungeprüfte Umhängungen.
- Atomare Stilllegung: Signaturcredentials widerrufen, offene Commands
  stornieren, serverseitiges Polling deaktivieren und externen Widerruf vormerken.
- Terminale Ingestion-Sperre und DB-Trigger gegen neue aktive Credentials,
  offene Commands und neue Kommunikationsidentitäten stillgelegter Gateways.
- Globale Gateway-Suche berücksichtigt direkte PropertyGrants für USER.
- Tests für Fresh-/Upgrade-Migration, Übergänge, fremde IDs und Mandanten,
  Rolleneskalation, fehlende Grants, Nebenläufigkeit und Audit-Rollback.

Die Prüfung ergab innerhalb dieses dokumentierten Umfangs keinen zusätzlichen
fachlichen Implementierungsbedarf. Ergänzt wurde dieser Abschlussnachweis.
Der vorhandene lokale Integrationshelfer wurde um die Migrationsstatusprüfung
bei laufender isolierter Testdatenbank erweitert.

## Qualitätsprüfungen

Die Aufrufe verwenden `corepack pnpm`, da `pnpm` nicht direkt im PATH liegt.
Für Prisma wurde ausschließlich eine lokale Test-DATABASE_URL gesetzt.

| Prüfung                                                        | Ergebnis                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm db:generate`                                             | erfolgreich                                                           |
| `pnpm typecheck`                                               | erfolgreich                                                           |
| `pnpm lint`                                                    | erfolgreich                                                           |
| `pnpm test`                                                    | 47 Dateien, 448 Tests erfolgreich                                     |
| `pnpm test:integration`                                        | 18 Basis-, 8 Import-, 6 Datenqualitäts-, 7 Regelprüfungen erfolgreich |
| `pnpm build`                                                   | erfolgreich                                                           |
| `pnpm migration:check`                                         | Schema valide; 48 Migrationen, Datenbank aktuell                      |
| `pnpm security:secrets`                                        | 0 Review-Funde; 24 erkannte Demo-/Templatewerte                       |
| `pnpm docs:check`                                              | erfolgreich                                                           |
| Prettier für die drei neuen Servermodule und den neuen DB-Test | erfolgreich                                                           |
| `git diff --check`                                             | erfolgreich                                                           |

Die vollständige Testsuite umfasst auch die gezielt vorgesehenen Dateien
`gateway-provisioning-db.test.ts`, `gateway-device-security-db.test.ts`
und `gateway-admin-ui.test.ts`.

Die DB-Tests verwenden neu angelegte Loopback-Cluster. Der Integrationshelfer
legt einen weiteren frischen Cluster auf Port 55455 an, migriert ihn und
seedet ihn ausdrücklich mit `SEED_DEMO=true` in der Testumgebung. Bestehende
Datenbanken und Passwörter wurden nicht überschrieben. Die Cluster werden
nach den Prüfungen gestoppt; ihre lokalen Dateien bleiben erhalten.

Der erste Sandbox-Lauf scheiterte bei Embedded PostgreSQL an
`uv_os_get_passwd ... ENOMEM`. Der freigegebene Lauf außerhalb der Sandbox
bestand. Ein gesonderter Migrationsstatusaufruf nach Stoppen der Testdatenbank
meldete erwartungsgemäß P1001; die Prüfung wurde anschließend erfolgreich
in den laufenden isolierten Integrationscluster aufgenommen.
`pg` meldet eine Deprecation-Warnung zu parallelen `client.query()`-Aufrufen;
dies verhindert derzeit keine Prüfung.

## Grenzen und Folgephase

Phase 1C-B bleibt für UI-/API-Anbindung der neuen Workflows,
Installationsnachweis, vollständige Readiness-Prüfung, Public-Key-Enrollment,
Import-/Umzugsworkflow und manuelle PKI-Bestätigungsaktionen zuständig.

Es wurden keine Zertifikate ausgestellt, Broker freigeschaltet, MQTT-Nachrichten
gesendet, Geräte verbunden oder Abrechnungen ausgeführt. Ein vorgemerkter
Widerruf bedeutet keine automatische MQTT-/PKI-/CRL-/Broker-Sperrung.
Ein physischer Fernstopp offline laufender Edge-Agenten wird nicht zugesichert.
Die bestehenden Gatewayansichten behalten außerhalb der globalen Suche ihre
bisherigen gefilterten Device-Sichten.
