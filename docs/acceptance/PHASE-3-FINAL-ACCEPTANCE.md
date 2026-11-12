# Phase 3 – verbindliche technische Abnahme und Readiness

Stand: **12.11.2026**, alle Ereigniszeiten in **UTC**. Berichtszeitzone: UTC;
Europe/Berlin ist am Stichtag UTC+1.

**Phase 3 Technical Acceptance: PASSED WITH EXTERNAL OPERATIONAL BLOCKERS.**

Die technische Abnahme kann für die unten belegten isolierten synthetischen
Szenarien fachlich geschlossen werden. Der formale Abschluss erfolgt mit Review
und Annahme dieser Konsolidierung. **Volle operative Phase-3-Abnahme: nicht
bestanden, weiterhin offen.** Dies ist keine Production-, Hardware-, IAM- oder
Staging-Freigabe und kein Nachweis, dass alle getesteten Feature-Branches auf
Master integriert oder bereitgestellt sind.

Dieses Dokument ist die einzige aktuelle Phase-3-Statusmatrix. Es ersetzt die
Statusaussagen früherer Readiness- und Acceptance-Berichte ausschließlich für
den hier beschriebenen Recovery-/WAL-/Alert-Scope. Die ältere Gateway-Transport-
Phase in `PHASE3-E2E.md` und andere Produktphasen werden nicht neu bewertet.
Historische Fehler, Messwerte, Grenzen und damals offene Punkte bleiben erhalten.

## Änderung gegenüber dem übergebenen akzeptierten Stand

Der übergebene Stand enthielt **Technical Independent Watchdog: PARTIAL**:
Implementierung und Push bestanden, Workflow aktiv auf Master, null echte
Schedule-Läufe; GitHub-Supportfall eingereicht. Das war ein externer
GitHub-Scheduler-/Dispatch-Blocker, kein nachgewiesener Softwarefehler.

Die lesende API-Prüfung am 12.11. belegt inzwischen zwei erfolgreiche echte
`event=schedule`-Läufe auf unverändertem Master
`2e4a708e69b14e2a227760cd30a173aaf453742e`:
[43094361275](https://github.com/Florian1518/Meterwerk/actions/runs/43094361275)
vom 11.11. um 20:12:47 und
[43137624178](https://github.com/Florian1518/Meterwerk/actions/runs/43137624178)
vom 12.11. um 01:53:50. Beide Watchdog-Jobs einschließlich Poll, Receiver und
Evidence-Upload sind erfolgreich. Workflow-ID: `413393844`, Pfad:
`.github/workflows/wal-independent-watchdog.yml`, zuletzt bekannter Zustand:
`active`. Cron und Workflow wurden für diese Konsolidierung nicht verändert.

Das heruntergeladene Artefakt `independent-wal-watchdog-43137624178`, ID
`13907628922`, bestätigt `FAILED / STALE_PIPELINE` für den alten Quelllauf
`42819079627` und einen korrelierten Alert mit synthetischer Empfangsquittung
um `2026-11-12T01:53:59.025Z`. Ein grüner Job bedeutet hier erfolgreiche
Fehlererkennung und Zustellung, **keine gesunde WAL-Pipeline**. Die unveränderten
[Zustandsdaten](phase3-final/WATCHDOG-43137624178-state.json),
[Auditdaten](phase3-final/WATCHDOG-43137624178-audit.jsonl) und
[Empfangsdaten](phase3-final/WATCHDOG-43137624178-received.jsonl) sind beigefügt.

Damit ist der einzelne technische Schedule-Nachweis erfüllt und der Watchdog
technisch **PASSED**. Die historische Aussage „null Schedule-Läufe“ ist kein
aktueller Blocker mehr. Eine zuverlässige Fünf-Minuten-Taktung, dauerhafter
unabhängiger Betrieb und operative Reaktionszeiten folgen daraus nicht. Der
Supportfall bleibt laut Übergabe offen; Fallnummer, Supportantwort und
Schließungsbestätigung liegen nicht vor. Keine Kontaktaufnahme wurde ausgeführt.

## Finale Acceptance-Matrix

| Area                                               | Target                                                                                 | Evidence                                                                            | Status                      | Limitation                                                                                                                   | Next action                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Full Restore                                       | Normales Recovery ≤4 h                                                                 | E1: **7.471 s**                                                                     | **PASSED**                  | Isoliert synthetisch; Download bis Restore-Verifier und App Readiness; kein Host-Provisioning                                | Im autorisierten repräsentativen Betriebsdrill erneut messen                           |
| PITR                                               | Normales Recovery ≤4 h; korrektes Target                                               | E1: **8.068 s**                                                                     | **PASSED**                  | Download Base/WAL bis Target-Validierung; App Readiness nicht enthalten                                                      | Operative Recovery-Grenze vor Drill festlegen                                          |
| Host Loss                                          | Normal ≤4 h; kompromittierter Host ≤8 h                                                | E2: **28.613 s**                                                                    | **PASSED**                  | Leerer isolierter Docker-Daemon bis Verifier/App Readiness; kein reales OS-/DNS-/TLS-/Key-Custody-Recovery                   | Repräsentatives Recovery erst nach Autorisierung                                       |
| Continuous WAL Offsite                             | Verschlüsselte, verifizierte fortlaufende WAL-Segmente und fail-closed Fehlererkennung | E4: drei IONOS-Zyklen; age, Version-Readback, Cipher-/Plaintext-Hash, SSE-S3/AES256 | **PASSED**                  | Synthetische Zyklen, zunächst erzwungene Switches; kein Dauerbetriebs- oder Least-Privilege-Nachweis; kein SSE-KMS behauptet | Dauerbetrieb im autorisierten Betriebsplan separat prüfen                              |
| Technical RPO                                      | ≤300 s bei aktivem WAL; täglicher Full-Backup-Fallback Ziel ≤24 h                      | E5: drei natürliche Post-ready-Zyklen **61.456 / 68.380 / 63.672 s**                | **PASSED**                  | Worst commit-to-verified-offsite **68.380 s**, nach Startup-Gate; kein allgemeines Worst-case-SLA                            | Startup-Schutz und repräsentative Last im Betriebsdrill einschließen                   |
| Technical RTO                                      | ≤4 h normal / ≤8 h kompromittierter Host                                               | E1/E2: konservative beobachtete Hülle **28.613 s**                                  | **PASSED**                  | Maximum der Szenarien, keine Addition; PITR hat andere Endgrenze                                                             | Provisioning, Schlüssel, Operator, DNS/TLS separat aufnehmen                           |
| Combined Technical RPO/RTO                         | Beide technischen Ziele innerhalb ihres dokumentierten Scope                           | E1/E2/E5                                                                            | **PASSED**                  | Getrennte isolierte Szenarien, keine gemeinsame operative SLA-Übung                                                          | Operative gemeinsame Messung planen                                                    |
| Technical Alert/Detection                          | Exakte Fehlerklassifikation und fail closed                                            | E6: Upload, Stale Pipeline, WAL-Gap, Hashfehler, Startup-Gate                       | **PASSED**                  | Direkte synthetische Aufrufe; keine gemessene externe Poll-Latenz                                                            | Repräsentative Detection-to-response-Kette planen                                      |
| Technical Notification                             | Zustellung an isolierten synthetischen Receiver                                        | E7/E9 und korrelierte Receiver-Quittungen                                           | **PASSED**                  | Loopback/Kindprozess, kein externer Anbieter oder On-call-Kanal                                                              | Externen Kanal und Empfänger vor realem Drill freigeben lassen                         |
| Human Operator Acknowledgement Evidence            | Echte menschliche ACK, unabhängig von Health                                           | E10: Florian1518; **383.674 s** Incident→ACK                                        | **PASSED**                  | Reale ACK in synthetischem Drill, keine SLA-Zusage                                                                           | Repräsentative Besetzung und Eskalation separat prüfen                                 |
| Synthetic Human Response Drill                     | ACK lässt Fehler bestehen; technische Reparatur stellt Health her                      | E10: **531.350 s** Incident→healthy                                                 | **PASSED**                  | Nur synthetischer Stale-Zeitstempel repariert; kein Infrastruktur-Recovery                                                   | Operativen Drill nach Freigabe durchführen                                             |
| Genuine Recovery Validation schedule               | Erfolgreiches echtes `event=schedule`                                                  | E8: 42666577374                                                                     | **PASSED**                  | Synthetische Recovery; einzelner echter Lauf belegt keine pünktliche Dauerplanung                                            | Zeitplanzuverlässigkeit operativ beobachten                                            |
| Technical Independent Watchdog                     | Implementierung, Push und echter Master-Schedule mit Evidence                          | E7/E9: Push plus zwei Schedule-Läufe; E9-Artefakt geprüft                           | **PASSED** (zuvor PARTIAL)  | Metadatenquelle statt Live-WAL; synthetischer Empfänger, keine Cross-run-Deduplizierung oder garantierte Taktung             | Supportfall mit vorhandenen Nachweisen bewerten; keine weitere Cron-Änderung           |
| Operational/SLA RPO/RTO                            | Vereinbarte operative Grenzen unter repräsentativen Bedingungen                        | Kein entsprechender akzeptierter Drill                                              | **PENDING**                 | Technische Zeiten schließen Provisioning, Betreiber und Produktionslast aus                                                  | Autorisierten Operations-Acceptance-Plan mit Messgrenzen erstellen                     |
| Operational/SLA Alert Response                     | Vereinbarte Detection-, Notification-, ACK- und Recovery-Ziele                         | Technische/synthetische Vorstufen vorhanden                                         | **PENDING**                 | Kein repräsentatives On-call- oder SLA-Ergebnis                                                                              | Verantwortliche, Eskalation, Messziele und Zeitfenster festlegen                       |
| Representative external notification/on-call drill | Reale freigegebene Zustellung und repräsentative menschliche Reaktion                  | Kein entsprechender akzeptierter Drill                                              | **PENDING**                 | Bisher ausschließlich synthetischer Receiver                                                                                 | Konkreten Auftrag für Kanal, Empfänger und Drill einholen                              |
| IAM Least Privilege                                | Realer IONOS-Prinzipal mit überprüften Minimalrechten                                  | Übergabe und archivierte IONOS-Grenzen                                              | **BLOCKED — extern**        | Echter IONOS `ContractUserId` fehlt; bestehender Admin-Kontext beweist keine Minimalrechte                                   | Betreiber stellt reale Identität und Autorisierung bereit; nichts ableiten oder ändern |
| Staging Recovery                                   | Freigegebene Quelle und Principal für isoliertes Recovery                              | Keine freigegebene Source-/Principal-Kombination                                    | **BLOCKED — Autorisierung** | Technische synthetische Recovery ersetzt keine Staging-Freigabe                                                              | Schriftlich genehmigte Quelle, Principal, Scope und Fenster bereitstellen lassen       |

Aktuell: **13 PASSED, 0 PARTIAL, 3 PENDING, 2 BLOCKED**. Der frühere
Watchdog-PARTIAL-Status ist ausschließlich wegen neuer echter Schedule-Evidence
abgelöst. Operative Unvollständigkeit wird nicht durch technische PASS-Zeilen
verdeckt. Die offenen operativen Punkte sind fehlende Abnahmen, keine daraus
abgeleiteten Softwaredefekte.

## Evidence-Register: getestete Runs und SHAs

Die [API-Metadaten](phase3-final/RUN-METADATA.json) enthalten neun am Stichtag
erneut gelesene erfolgreiche Runs mit Event, Attempt, Branch und SHA. Ein
Dokumentations-SHA ersetzt niemals den ausgeführten Code-SHA.

| Evidence                              | Run / Quelle                                                                                                                                                                                       | Getesteter SHA / Dokumentationsprovenienz                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| E1 Full Restore und PITR              | [41802033425](https://github.com/Florian1518/Meterwerk/actions/runs/41802033425), push; Artefakt 13308157780                                                                                       | `4e928ed1a96f33db5a28f0f1d3dcdd3b1f530494`                                                          |
| E2 Host Loss                          | [42040140763](https://github.com/Florian1518/Meterwerk/actions/runs/42040140763), workflow_dispatch; Artefakt 13421845531; vorheriges Persistence-Gate 42034092512                                 | `1120e7cfec11ae81374ed0745136138218cf4ae6`                                                          |
| E3 Begleitende vollständige CI        | [42041884271](https://github.com/Florian1518/Meterwerk/actions/runs/42041884271), push                                                                                                             | `91e57a5bdfe8cfa17795b27a4ea4549bbc029063`                                                          |
| E4 Continuous WAL                     | [42595934065](https://github.com/Florian1518/Meterwerk/actions/runs/42595934065), workflow_dispatch; Begleit-CI 42595857254                                                                        | `ddc8518f006c8c1aa2e152db37524321c098b643`                                                          |
| E5 Startup-Schutz und natürlicher RPO | [42819079627](https://github.com/Florian1518/Meterwerk/actions/runs/42819079627), workflow_dispatch                                                                                                | `b630f2258d2531080848c5774b09ccccfd1485e3`                                                          |
| E6 Technical Detection                | [Archivierter Detektionsbericht](phase3-final/history/SYNTHETIC-ALERT-RESPONSE-20261110.md.txt), lokale Windows-Evidence                                                                           | Dokumentationsstand `95afeff875420205ede1a1c7a1e5660cc9e0c5db`; keine erfundene separate CI-Run-ID  |
| E7 Watchdog Push / Notification       | [42835897783](https://github.com/Florian1518/Meterwerk/actions/runs/42835897783), push; ursprüngliche [synthetische Evidence](SYNTHETIC-INDEPENDENT-WATCHDOG-20261110.json)                        | `95afeff875420205ede1a1c7a1e5660cc9e0c5db`                                                          |
| E8 Recovery schedule                  | [42666577374](https://github.com/Florian1518/Meterwerk/actions/runs/42666577374), schedule, Attempt 1                                                                                              | `9c04c2ebaf39227189ff586d5fd8df6f249054fe`                                                          |
| E9 Watchdog schedule                  | [43094361275](https://github.com/Florian1518/Meterwerk/actions/runs/43094361275) und [43137624178](https://github.com/Florian1518/Meterwerk/actions/runs/43137624178), schedule, jeweils Attempt 1 | `2e4a708e69b14e2a227760cd30a173aaf453742e`                                                          |
| E10 Human Response                    | Incident `operator-drill:stale-pipeline:20261111T141936686Z`; [unveränderte JSON-Evidence](phase3-final/HUMAN-OPERATOR-RESPONSE-DRILL-20261111.json)                                               | Dokumentationscommit `ce2a8f13f7d8b46f0427ab921447d4cd56c6dcc0`; lokaler Drill, keine GitHub-Run-ID |
| Historischer Recovery-Kontrolllauf    | [41791165665](https://github.com/Florian1518/Meterwerk/actions/runs/41791165665), push; archivierte API-Evidence, kein Schedule                                                                    | `9c04c2ebaf39227189ff586d5fd8df6f249054fe`                                                          |

Frühere Master-Integration: Kandidat `21e196762c18bc8ad7b3425a2b49652a0de43acc`,
Merge `43cee3416778f172fbfd2f05c88bbd491ac5a070`, CI 41636755019/41636765372,
Recovery 41636754986/41636765785, Master-CI 41638394904, Push-Recovery
41638394907 und manueller Recovery-Run 41638539926 bleiben im bestehenden
[Readiness-Bericht](../SOFTWARE-READINESS-RC7.md) erhalten. Manuelle und
Push-Läufe ersetzen keinen Schedule-Nachweis. RC7 bleibt unverändert.

## Menschliche Reaktionskette

| Ereignis                                   | UTC                      |
| ------------------------------------------ | ------------------------ |
| Incident injiziert / erkannt               | 2026-11-11T14:19:36.890Z |
| Notification empfangen                     | 2026-11-11T14:19:36.962Z |
| Menschliche ACK, Florian1518               | 2026-11-11T14:26:00.564Z |
| Nach ACK weiterhin FAILED / STALE_PIPELINE | 2026-11-11T14:28:28.234Z |
| Reparaturstart                             | 2026-11-11T14:28:28.237Z |
| Healthy nach technischer Reparatur         | 2026-11-11T14:28:28.240Z |

Incident→ACK **383.674 s**, Incident→healthy **531.350 s**. ACK hat Health
**nicht** gelöscht. Nur die reparierte synthetische technische Bedingung
erlaubte healthy. Diese Werte sind keine operativen SLA-Ergebnisse. Die
archivierte JSON-Datei enthält noch den damaligen Watchdog-Blocker; als
unveränderte historische Quelle wird sie nicht nachträglich aktualisiert.

## Erhaltene Fehlerhistorie und Messgrenzen

Die vollständigen ausgewählten Berichte sind bytegetreu als `.md.txt`
archiviert, damit historische Statusbehauptungen nicht als aktuelle
Runbook-Anweisungen erscheinen. Das [Quelleninventar](phase3-final/SOURCE-INVENTORY.json)
enthält Originalpfad, Commit, SHA-256 und sämtliche darin gefundenen Run-IDs.
Relative Verweise und damalige Befehle innerhalb dieser Klartextkopien gehören
zum Original-Commit, nicht zur aktuellen Ausführungsanweisung. Keine Original-
Evidence-Datei oder Fehlhistorie wurde gelöscht oder auf PASS geändert.

- [IONOS-Zwischenstand](phase3-final/history/IONOS-READINESS-20261104.md.txt):
  Host Loss zunächst wegen Mosquitto-Config-Open blockiert; Ursache damals
  unbewiesen. CI 41791165623 scheiterte am Browser-Heading-Race.
  [Recovery-Historie](phase3-final/history/DISASTER-RECOVERY.md.txt) bewahrt die
  spätere erfolgreiche Host-Loss-Abnahme und ihre Infrastrukturgrenzen.
- [WAL-Offsite-Bericht](phase3-final/history/WAL-OFFSITE-42595934065.md.txt):
  42595552218 Paketinstallation fehlgeschlagen; 42595336472 und 42595481636
  Format-Gate fehlgeschlagen. Spätere erfolgreiche Runs überschreiben sie nicht.
- [Technische RPO/RTO-Historie](phase3-final/history/TECHNICAL-RPO-RTO-20261109.md.txt):
  42600455962/42601200178 `ARCHIVE_TIMEOUT_NOT_AUTOMATIC`;
  42611695559/42613286232 Diagnoseabfragen fehlgeschlagen;
  42611990673/42613659743 ohne natürlichen Switch;
  42621101392 fehlerhafte Diagnoseformatierung;
  42633154371/42635642689 unvollständige Wait-/Timeout-Beobachtung.
  Der spätere [Quelldiagnosebericht 42637704239](phase3-final/history/PG16-TIMEOUT-42637704239.md.txt)
  erklärt den initialen 300-s-Checkpointer-Wait, ist selbst keine Stock-RPO-Abnahme.
  Die frühere **72.604 s**-Rechnung bleibt eine bedingte Schätzung, kein Messwert.
- [Stock-PG16-Bericht](phase3-final/history/STOCK-PG16-20261110.md.txt):
  42775026519 Paketproblem; 42775271308 Beobachterfehler;
  42776171861 ungültige Zeit-/Segmentzuordnung;
  42777960179 Target-Verfehlung; 42781578715 Zwischenmessung mit fehlerhafter
  Segmentzuordnung; 42784657870 **305.630 s**, weiterhin FAILED gegenüber
  unverändertem 300-s-Ziel. Der frühere startup-inclusive Wert **307.177 s**
  wird ebenfalls nicht als bestanden umgedeutet.
- [Startup-Gate-Bericht](phase3-final/history/STARTUP-WAL-READINESS.md.txt):
  42791806505 erster Post-ready-Zyklus **300.579 s**, FAILED;
  42816631791 Verifier-Boundary-Race, weiterhin nicht akzeptiert.
  Erst 42819079627 besteht: Startup-Gate **306.108 s** separat von drei
  Post-ready-Zyklen. Der Startup-Anteil verschwindet nicht aus der Evidence;
  normale Anfragen bleiben bis zur verifizierten natürlichen Warm-up-Phase gesperrt.
- [Historischer Schedule-Bericht](phase3-final/history/SCHEDULE-RECOVERY-20261109.md.txt)
  bewahrt die früher fehlenden Schedule-Nachweise und nicht qualifizierenden
  Kontrollläufe. E8/E9 lösen die fehlende technische Evidence ab, nicht die
  weiterhin unbewiesene operative Pünktlichkeit.
- [Watchdog-Integration](INDEPENDENT-WATCHDOG-INTEGRATION.md) bewahrt den
  Windows-Temporärverzeichnis-Cleanup-Fehler nach 564 bestandenen Tests und
  den anschließenden erfolgreichen isolierten Wiederholungstest.

## Auditumfang, Integration und externe Abhängigkeiten

Geprüft wurden README, Dokumentationsindex, Architektur, RC7-Readiness,
Known Limitations, Disaster Recovery, Backup/Restore, Monitoring, DR-Drills,
Recovery-Runbook und beide vorhandenen Watchdog-Acceptance-Berichte sowie die
historischen WAL-/RPO-/Stock-/Startup-/Schedule-/Human-Response-Quellen im
Quelleninventar. Aktuelle Einstiegspunkte verweisen auf diese Matrix; datierte
Altberichte bleiben ausdrücklich historische Momentaufnahmen. Bestehende
Staging-/Production-/Betriebsvoraussetzungen wurden nicht als erfüllt markiert.

Die akzeptierten WAL-/Startup-/Host-Loss-Nachweise stammen teilweise aus
separaten Branches. Master enthält die begrenzte Watchdog-Integration, nicht
automatisch den gesamten Offsite-Transport oder Startup-Gate-Code. Das ist eine
Integrations-/Bereitstellungsgrenze, keine Widerlegung der getesteten Evidence.
Die Konsolidierung importiert ausschließlich Dokumentation und nicht geheime
Evidence; keine Runtime, Workflows oder Infrastruktur werden verändert.

Extern verbleiben die reale IONOS-Identität und passende Autorisierung,
genehmigte Staging-Quelle/Principal sowie Betreiberentscheidungen zu
repräsentativen On-call-Bedingungen, externem Benachrichtigungskanal und
operativen Messzielen. Die GitHub-Support-Eskalation ist laut Übergabe offen;
fehlender Schedule-Nachweis ist inzwischen behoben, verlässliche Taktung ist
nicht bestätigt. Kein Zugriff auf Support-Inhalte oder reale Infrastruktur
wurde zur Konsolidierung benötigt.

## Abschluss und exakt nächster Schritt

**Technisch fachlich abschließbar: ja, mit dem ausgewiesenen Scope und den
externen operativen Restpunkten. Formaler Abschluss: nach normalem Review und
Annahme dieses Dokumentations-PR. Volle operative Phase 3: nein.**

Nächste Aufgabe: **„Phase 3 Operations Acceptance – repräsentativen externen
Notification-/On-call-Drill und RPO/RTO-Messplan zur Freigabe vorbereiten“**.
Zuerst Verantwortliche, Kanal/Empfänger, Szenarien, Messgrenzen, UTC-Zeitfenster,
Abbruchkriterien und erforderliche Source-/Principal-Autorisierung konkret
dokumentieren; getestete SHAs gegen den vorgesehenen Deployment-Kandidaten
abgleichen. Der Plan ist keine Ausführungsfreigabe. Kein erneutes Watchdog-
Cron-Tuning und keine eigenmächtige Phase-4-/Production-Freigabe.

## Prüfung der Konsolidierung

Lokal am 12.11.2026 bestanden: Dokumentationslinks (111 Markdown-Dateien),
Dokumentationsvalidierung (13 erforderliche Guides), Prettier für alle geänderten
Markdown-Dateien und neuen JSON-Evidence-Dateien, `git diff --check` sowie
Secret-Scan mit **0 Findings** (Arbeitsdateien, keine vollständige Git-Historie).
Die separate Konsistenzprüfung bestätigte 16 Evidence-Hashes und unveränderte
Quell-Snapshots, neun Run-/SHA-Datensätze, echte Schedule-Events, ACK-/Recovery-
Zeitdifferenzen, unveränderten Fehlerzustand nach ACK, Alert-/Receipt-Korrelation,
die Statuszählung 13/0/3/2, den reinen Dokumentationsdiff und unveränderte Workflows.
Der ursprüngliche UTF-8-BOM der menschlichen JSON-Evidence bleibt bytegetreu
erhalten; die Konsistenzprüfung berücksichtigt ihn beim Parsen.

Zusätzlich bestanden alle **66** bestehenden isolierten Node-Tests für Watchdog,
WAL-Prädikate, negative Recovery-Ergebnisse und PITR-Archivierung. Dabei wurden
nur lokale synthetische Fixtures und Loopback-Receiver genutzt. Kein realer
Recovery-/Offsite-/Geräte- oder externer Nachrichtendrill wurde ausgeführt.
Prisma-Generierung, App-Build und DB-Integration wurden für diesen reinen
Dokumentationsdiff lokal nicht neu ausgeführt; historische PASS-Ergebnisse
werden nicht als neuer Test dieses Commits ausgegeben. CI und Reviewstatus
werden im regulären Dokumentations-PR festgehalten.
