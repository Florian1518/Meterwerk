# Upgrade-Handbuch

Dieses Handbuch gilt für kontrollierte Updates einer bestehenden Installation. Ein normaler Neustart benötigt kein Restore. Ein Upgrade aktualisiert App/Worker und kann Datenbankschema ändern; ein Restore ist ausschließlich ein gesonderter, geprüfter Recovery-Vorgang (siehe [Disaster Recovery](DISASTER-RECOVERY.md)).

## Ablauf

1. Zielversion, Release Notes und bekannte Einschränkungen prüfen. CI für genau den Git-SHA muss erfolgreich sein.
2. Umgebung, laufende Version, Migrationstand und Datenbank-Erreichbarkeit erfassen. Upgrade ausschließlich mit freigegebenem Release-Artefakt durchführen.
3. Prüfen, dass ein aktuelles, verifiziertes Backup vorhanden und dessen Storage erreichbar ist. Vor einer kritischen Migration ist ein Backup erforderlich.
4. Release-Konfiguration und externe Secret-Referenzen bereitstellen. Keine Secrets in Kommandozeilen, Logs oder Git schreiben.
5. Migrationen prüfen (`pnpm migration:check`) und mit der dokumentierten Release-Version anwenden (`pnpm db:migrate` bzw. im Container das Prisma-Migrationskommando der Release-Version).
6. Web- und Worker-Prozesse passend zum selben Release starten. Während eines Rollouts Worker-Kompatibilität und Queue-Leases beachten; alte Jobs nicht blind erneut ausführen.
7. Readiness, Migrationstand, Worker-Health und zentrale Smoke-Tests prüfen. Fehler und Abschluss mit Version/SHA dokumentieren.

## Fehler während des Upgrades

Bei fehlgeschlagener Migration keine parallele App-Version starten, keine Tabellen manuell löschen und keine Migration rückwärts vortäuschen. Logs und Migrationstatus sichern, Rollout stoppen und [Rollback](ROLLBACK.md) sowie bei Datenbeschädigung das [Recovery-Runbook](RECOVERY-RUNBOOK.md) verwenden.

Prisma-Migrationen sind nicht automatisch rückwärtskompatibel. Expand/contract-Änderungen können mehrere Releases erfordern. Datenbankwiederherstellung kann nachträgliche Daten verlieren und braucht eine ausdrücklich isolierte bzw. autorisierte Zielumgebung.

## Referenzen

[Datenbankbetrieb](DATABASE.md) · [Deployment](DEPLOYMENT.md) · [Releaseprozess](RELEASES.md) · [Backup/Restore](BACKUP-RESTORE.md)
