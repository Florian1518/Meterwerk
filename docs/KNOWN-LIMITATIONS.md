# Bekannte Einschränkungen

Diese Liste beschreibt Einschränkungen, die sich aus aktuellem Code und Repository-Konfiguration ergeben. Sie ist keine Zusage, dass jeder Providerbetrieb getestet wurde.

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
