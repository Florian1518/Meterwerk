# Bekannte Einschränkungen

## Aktuell: finale lokale RC-Bewertung auf `0186e076`, 02.10.2026

**LOCAL SOFTWARE ACCEPTANCE: PASSED.**

**METERWERK V1.0 RC PREPARATION: READY.**

**LOCAL SOFTWARE RELEASE BLOCKER: NONE.**

Next.js 16.3.8 und Dependency Audit mit 0 Advisories sind auf Code-SHA
`0186e076331f34dd10aefd6192c11417f25e2c04` dokumentiert. Der frühere Stand
`84ce62c` wurde nach dem Next.js-Sicherheitsbefund abgelöst. Die früheren
Prisma-Zyklusmeldungen waren ein Test-Harness-/Environment-Problem: falsche
Compose-DB statt isolierter Acceptance-DB; erneute Workerprüfung mit 47
Migrationen bestand. Details stehen im [finalen Nachweis](acceptance/FINAL-RC-0186E07.md).

Offen bleiben nur externe Validierungen: Remote CI, echtes Staging,
Signing Verification, Provider Validation, PITR/Full Restore, HA/Failover und
Representative Production Load. Hardwaretests mit realen Zählern/Gateways,
Modbus, M-Bus, Wireless M-Bus, Pulse, LoRaWAN und herstellerspezifischen Geräten
bleiben `HARDWARE_VALIDATION_PENDING`. Keine Production-Freigabe.

## Historisch: finale lokale RC-Bewertung auf `1e6589e`

Der Nachweis für `1e6589e` und die Bewertung auf `84ce62c` bleiben als Historie
erhalten. Der Befund zu Next.js 16.3.5 ist geschlossen; maßgeblicher RC-Code ist
nun `0186e076…`. Siehe [FINAL-RC-0186E07](acceptance/FINAL-RC-0186E07.md).

## Historische Prüfstände — durch obigen aktuellen Stand ergänzt

Historisch ab `5d8fc58`, 01.10.2026: Docker-Linux-Daemon weiterhin unerreichbar;
keine Images, Linux-Runtime-/Shutdown-/Lease-/Failover-Ergebnisse oder Image-SBOM.
Der erneut angeforderte lokale Performance-Lauf scheitert vor den Messreihen:
Windows Application Control blockiert das Argon2-Native-Binding (HTTP 500 beim
Dashboard-Warmup, auch im bestehenden Standalone-Artefakt). Keine Policy geändert.
Der frühere 4/4-Smoke bleibt historischer Nachweis und belegt nicht die aktuelle
Windows-Umgebung. Softwarefix PASSED; aktuelle lokale Release-Gates offen;
keine RC-Vorbereitung/Freigabe. CI CONFIG_VERIFIED; Signing
SIGNING_PREPARED_NOT_VERIFIED. [Aktuelle Evidence](acceptance/CONTAINER-READINESS-5D8FC58.json)
und [Acceptance-Ergebnis](acceptance/SOFTWARE-ACCEPTANCE-RESULT.md).

Aktuell, 01.10.2026: Fortsetzung von `943d23f` am offenen Image-Gate. Vier
Release-Pfadfehler korrigiert, 5/5 gezielte Regressionstests bestanden. Reale
Linux-Containerabnahme bleibt mangels Daemon offen, ebenso Signing, CI,
Failover und Staging. Maßgeblicher Stand und Nachweisgrenzen:
[Checkpoint-Fortsetzung](acceptance/PHASE-5V-CHECKPOINT-943D23F.md).

Diese Liste beschreibt Einschränkungen, die sich aus aktuellem Code und Repository-Konfiguration ergeben. Sie ist keine Zusage, dass jeder Providerbetrieb getestet wurde.

## Historischer Stand — 29.09.2026, WIP `a873a87`

Auf WIP `a873a87` wurde das Windows-x64-Production-Paket frisch gebaut und
verifiziert. Der Standalone-Smoke bestand 4/4 Prüfungen. Der lokale Docker-
Daemon war nicht verfügbar; Images und Image-SBOM sind nicht ausgeführt. Die
statische Prüfung des Worker-Dockerfiles fand `tsx` aus Dev-Dependencies als
Runtime-Entrypoint und das Kopieren ungefilterter `node_modules`. Vor einem
Worker-Image-Release muss die Runtime auf erforderliche Production-Dependencies
beschränkt und das Image danach gebaut und geprüft werden. Dies ist ein offener
Software-Release-Blocker auf diesem historischen Stand. Signing ist vorbereitet,
aber weder signiert noch verifiziert; GitHub Actions und Staging wurden für den
SHA nicht ausgeführt. Der nachfolgende Worker-Runtime-Abschnitt aktualisiert
diesen Befund. Details zum lokalen Paket stehen in
[Artefaktnachweis](acceptance/RELEASE-ARTIFACT-A873A87.json).

## Aktueller Worker-Runtime-Stand — 29.09.2026

Der Worker-Code wird in drei JavaScript-Bundles gebaut. Das Worker-Image
installiert für die Laufzeit ausschließlich Produktionsabhängigkeiten, kopiert
den generierten Prisma-Client und Bundles und startet unter `meterwerk`; `tsx`
und Dev-Abhängigkeiten sind im statisch ermittelten Runtime-Abschluss nicht
enthalten. Die lokale Regression bestand Build, Rules-Integration,
Artefakt-Verifier, statische Worker-Prüfung und Standalone-Smoke.

Der Docker-Desktop-Linux-Daemon war nicht erreichbar. Web-/Worker-Image-Builds,
Container-Runtime, Image-Digests und Image-SBOM sind darum
`NOT_EXECUTED` / `EXTERNAL_VALIDATION_PENDING`. Signing bleibt
`SIGNING_PREPARED_NOT_VERIFIED`; Staging, CI-Lauf auf unveränderlichem finalem
SHA und Betriebs-Failover bleiben offen. Lokale Performance ist synthetisch,
sequenziell und keine Produktionskapazitätsaussage. Hardware ist
`HARDWARE_VALIDATION_PENDING`.

Ein lokaler SIGTERM-Lifecycle-Versuch für Rules/Rollout war unter Windows nicht
auswertbar und zählt nicht als Shutdown-Nachweis; Linux-Container-Smokes stehen
noch aus.

Die Teil-2-/Teil-3-Abschnitte unten sind historische Befunde. Die vorhandene
uncommittete Fortsetzung implementiert inzwischen alle 13 Demo-Szenarien mit
persistierten Produktwirkungen (266 DB-/HTTP-Checks); zwei ergänzte Browserfälle
prüfen Steuerung und sichtbaren Zählerstatus. Die Aussage „nur Metadaten“ ist
für diesen Arbeitsstand überholt. Refresh wendet das aktuelle Szenario mit seinem
stabilen UTC-Anker erneut an; es ist kein laufender Messwertgenerator.

Die 47-Migrations-Clean-Installation sowie das Upgrade von der einzigen
versionierten Pilotbaseline `v0.4b-pilot-ready` (7 Migrationen) auf 47 sind
isoliert belegt; sieben synthetische Datenbereiche blieben erhalten. 008/009
existierten in diesem Tag noch nicht und werden beim Upgrade erstmalig aus den
korrigierten kanonischen Dateien angewendet. Die v1.0-Baseline ist ausdrücklich
auf diese getaggte Herkunft und neue Clean Installs begrenzt. Nicht getaggte
interne/dev-Datenbanken mit unbekannten oder abweichenden Checksummen sind nicht
unterstützt; der lesende Preflight stoppt sie ohne Reparatur oder
`_prisma_migrations`-Änderung. Siehe [Baseline](MIGRATION-BASELINE.md).

Der reproduzierbare Dependency Audit auf Commit `4932f00` bestand mit pnpm 12.5.1,
Exitcode 0 und null Advisories aller Schweregrade; Lockfile-SHA und Befehl stehen
im [Provenance-Artefakt](acceptance/DEPENDENCY-AUDIT-4932F00.json). Das lokale Performance-Gate besteht mit vorhandenen
Messwerten; sequenzielle Requests und leere Worker-Queues belegen keine Lastkapazität.

Die transitive Lockfile-SBOM enthält nun 750 Komponenten. Web-Tar, drei
Worker-Bundles und sechs Prüfsummen wurden erzeugt und strukturell geprüft.
Ein frisch entpacktes Windows-x64-Webpaket bestand Health-/Readiness- und
synthetischen Login-/Dashboard-Smoke; das erforderliche native Argon2-Binding
wird beim Packaging explizit eingeschlossen. Das ersetzt keine Images oder
Runtime-Abnahme anderer Plattformen. Docker-Daemon, Staging, CI,
Signierung/Provenance und Providerbetrieb bleiben unbestätigt. Zusätzlich zu den 44 vorhandenen Produktpfad-Checks besteht nun
eine mobile Field-Service-Journey mit echter HTTP-Zuweisung, Checkliste,
Arbeitsbericht, Zeit/Material, Technikerbestätigung und Abschluss. Das belegt
den synthetischen Wartungspfad; andere Einsatztypen und physische
Inbetriebnahme werden dadurch nicht pauschal abgenommen. Siehe [Fortsetzungsbericht](acceptance/PHASE-5V-RESUME.md).

- Reale Zähler, physische RS485/Modbus RTU, M-Bus/W-MBus, Pulse, LoRaWAN-Netze und Hersteller-APIs wurden nicht als Hardwarevalidierung nachgewiesen.
- S3-kompatible Storage-Abstraktion ist vorhanden, aber ein konkreter externer Provider, Versionierung, Restore und Ende-zu-Ende-Berechtigungsbetrieb müssen noch validiert werden.
- PITR benötigt WAL-Archivierung und Provider-Infrastruktur; keine produktive PITR-Prüfung pauschal belegt.
- Backup-Metadaten/DR-Workflows sind teilweise vorhanden, aber `scripts/backup.ts` ist kein nachgewiesener produktiver, persistenter Backup-Scheduler. Schedulerbetrieb, Alerting und vollständiger isolierter Restore-Drill sind umgebungsabhängig/offen.
- `compose.staging.yaml` wurde auf getrennte Web-/Worker-Images, reale Laufzeitvariablen und private persistente lokale Attachments korrigiert. Der Stack wurde mangels laufendem Docker-Daemon nicht gestartet; vollständige Staging-Readiness bleibt unvalidiert.
- Mail-Implementierung stellt eine lokale In-Memory-Outbox bereit; SMTP/API-Providerzustellung und dauerhafte Mail-Sandbox sind nicht implementiert. Push-Providerbetrieb ebenfalls providerabhängig.
- Readiness prüft nicht automatisch alle Worker, MQTT und Storage gleichzeitig. Externe Metrik-/Alertplattform ist nicht mit der Anwendung gleichzusetzen.
- Release Workflow baut/verpackt Artefakte und SBOM; automatische Staging- oder Production-Deployment-Promotion ist nicht implementiert.
- Empirische Last-/Performance- und Hochverfügbarkeitstests in produktionsähnlicher Umgebung sind nicht belegt.
- Die Environment Guards erkennen offensichtliche bekannte Endpunktmuster, ersetzen aber keine vollständige Secret-/Netzwerkisolation. Jede Umgebung benötigt getrennte Ressourcen und externe Freigabe.

Vor Pilot/Produktion offene Punkte anhand [CAPABILITIES.md](CAPABILITIES.md), [Production Checklist](SECURITY-CHECKLIST.md), [Deployment](DEPLOYMENT.md) und [Staging](STAGING.md) abarbeiten.

## Ergänzungen aus Phase 5v Teil 2 (28.09.2026)

- Die isolierte PostgreSQL-Abnahme ist erweitert: 46 Migrationen von Null und Upgrade von 39 auf 46 Migrationen wurden ausgeführt. Das ersetzt keinen Upgrade-Nachweis für beliebige bereits betriebene Datenbanken. Zwei historische Dashboard-Migrationen mussten für Clean Install korrigiert werden; vorhandene Migrationschecksummen vor einem Rollout gezielt abgleichen, nicht automatisch umschreiben oder als angewendet markieren.
- Das Windows-x64-Prebuild `@node-rs/argon2` 2.2.1 ist installiert und Argon2id Hash/Verify funktionieren in einem direkten Node-24.19.0-x64-Prozess. Der zuvor sandbox-gestartete Next-Prozess konnte das optionale native Modul nicht laden. Nach Neustart der gebauten App außerhalb dieses Prozesskontexts bestanden Login, HTTP/API und Production Build; es wurde keine schwächere Hashmethode eingesetzt. `pnpm audit` bleibt mangels startbarem `pnpm-native.exe` ungeprüft.
- Der Teil-2-Demo-Seed wurde um synthetische Gateway-, Geräte-, WorkOrder-, Support-, Dashboard-, Report-, Regel- und Anomalie-Fixtures ergänzt. Reset, Seed und Verify bestanden danach mit 2 Tenants, 7 Usern, 6 Properties, 48 Metern, 41.064 Readings sowie jeweils 2 Geräten, Gateways, WorkOrders, Supportfällen, Dashboards, Reports, Regeln und Anomalien. Demo-Szenarien persistieren weiterhin nur Auswahl und Audit-Metadaten: `setDemoScenario` erzeugt keine szenariospezifischen Messwert-/Alarm-/Firmware-Effekte; `refreshDemoData` protokolliert Metadaten, baut aber keinen Szenariodatenbestand neu auf. Die 13 Metadatenprüfungen sind daher keine vollständige Szenario-E2E-Abnahme.
- SBOM-Erzeugung liefert 34 direkte Abhängigkeiten, davon 32 mit Versionsbereichen aus `package.json`; aufgelöste transitive Versionen fehlen. Das Release-Skript erzeugt Metadaten, kein nachgewiesen deploybares Web-/Worker-Artefakt. Signierung bleibt unkonfiguriert; Checksummen der zwei lokalen Metadatendateien sind keine Image-/Release-Verifikation.
- CI-Vorbereitung für Seed, Prisma-Generierung und laufende Browser-Testanwendung wurde korrigiert und statisch geprüft. GitHub Actions wurde nicht ausgeführt. Dockerfile-/Worker-Verzeichnisstruktur und Generierung wurden korrigiert, Images mangels Docker-Daemon nicht gebaut. Ein immer erfolgreiches Worker-Healthcheck-Kommando wurde entfernt; ein belastbarer Worker-Readiness-Nachweis bleibt offen.
- Die lokalen Build-Datenbank-URLs enthalten keine Dummy-Zugangsdaten mehr. Die zuvor vom Secret Scan gemeldeten drei `credential-url`-Reviewtreffer verschwanden; der letzte Secret Scan meldete 0 Review-Funde und 17 bekannte Demo-/Template-Werte.
- Vollständige Field-Service-/Attachment-, Device-/Fleet-, Analytics-/Rule-, Support-/Operations- und PWA-Journeys sind nur teilweise verifiziert. DB-Serviceprüfungen mit injiziertem Actor und Browserkomponenten mit simulierten API-Antworten ersetzen keinen authentifizierten Gesamtworkflow.

## Teil-3-Nachprüfung (28.09.2026)

- Die 13 auswählbaren Demo-Szenarien erzeugen weiterhin keine dazugehörigen Messwert-, Alarm-, Geräte-, Wartungs-, Support- oder Rollout-Produktzustände. Das bleibt ein RELEASE_BLOCKER; Demo-Auswahl und Audit-Eintrag allein sind keine Szenarioabnahme.
- Die Migrationen `202609240008_dashboards` und `202609240009_dashboard_recovery` weichen weiterhin vom Stand des WIP-Baseline-Commits ab. Die lokale Acceptance-Datenbank wurde mit den geänderten Fassungen angelegt und beweist keine Kompatibilität mit einer Bestandsdatenbank, die Originalchecksummen registriert hat. Die Original-008 scheitert beim doppelten Unique-Index; ein ausschließlich späterer Forward-Fix kann einen Clean Install nicht erreichen, solange 008 vorher abbricht. Keine sichere Kompatibilitätsstrategie wurde nachgewiesen; keine `_prisma_migrations`-Einträge wurden geändert.
- Dependency Audit bleibt NOT_EXECUTED: Windows Application Control blockiert `pnpm-native.exe` 12.5.1. Sicherheitsfindings sind damit unbekannt.
- `performance-fixture.mjs` erstellt nur Metadaten und simuliert keine Datenbank- oder HTTP-Last. Ohne echte Messdatei wurde kein Performance Gate ausgeführt.
- Transitive SBOM mit gelockten Versionen, Web-/Worker-Images und zugehörige Prüfsummen fehlen. Docker war nicht verfügbar. Signierung ist nicht konfiguriert, Staging nicht ausgeführt und GitHub Actions nicht für diesen Arbeitsstand gestartet.

# Historischer Phase-5v-Zwischenstand vor den Worker-Prüfergebnissen

- Worker-Image-Runtime wurde auf kompilierte Worker-Bundles und
  Produktionsabhängigkeiten umgestellt. Bis die gezielten Build- und
  Static-Verification-Ergebnisse vorliegen, bleibt die Softwarekorrektur in
  Prüfung.
- Lokaler Docker-Desktop-Linux-Daemon ist derzeit nicht erreichbar. Reale
  Container-Builds, Start-/Health-Smokes, Image-Digests und Image-SBOM sind
  `NOT_EXECUTED` / `EXTERNAL_VALIDATION_PENDING`.
- Lokaler Performance-Nachweis ist kein HA-/Failover- oder Produktionslasttest.
- Staging, Providerintegration, CI-Lauf auf unveränderlichem finalem SHA,
  Signaturverifikation und Hardware bleiben ausstehend.
