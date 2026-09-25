# Datenbankbetrieb

Meterwerk verwendet PostgreSQL und Prisma. Fachliche Daten liegen in PostgreSQL; Backups werden als externe Dateien/Objekte verwaltet und nicht als Datenbank-Binärfelder abgelegt.

## Entwicklung

Voraussetzungen und sichere lokale Starts stehen in [DEVELOPMENT.md](DEVELOPMENT.md). Lokal kann `pnpm db:local` den eingebetteten Entwicklungsserver vorbereiten; die Compose-Entwicklungsdatenbank ist PostgreSQL 17. `DATABASE_URL` muss auf die ausdrücklich lokale Datenbank zeigen.

- Schema ändern: versionierte Migration erstellen und prüfen; gemeinsam genutzte Datenbanken nie mit `prisma db push` verändern.
- Client aktualisieren: `pnpm db:generate`.
- Migrationen anwenden: `pnpm db:migrate` (führt `prisma migrate deploy` aus).
- Status-/Migrationsprüfung: `pnpm migration:check`.
- Tests gegen Integration-DB ausschließlich nach Prüfung der URL und nur gegen dafür bestimmte Testdatenbank.

## Staging und Produktion

Je Environment getrennte Datenbank, Zugangsdaten und Backups verwenden. App-Prozesse benötigen nur die nötigen Laufzeitrechte; Migrationen kontrolliert mit der Release-Version ausführen. Keine manuellen Produktionsänderungen als Routine. Änderungen gehören in Schema und Migration, werden geprüft und auditiert.

Connection-Pooling und Failover-Endpoint providerabhängig konfigurieren. Nach Endpointwechsel Reconnect und Readiness prüfen; während eines Datenbankausfalls keine Writes als erfolgreich melden.

## Backup, Restore und Diagnose

Siehe [Disaster Recovery](DISASTER-RECOVERY.md), [Recovery Runbook](RECOVERY-RUNBOOK.md) und [Backup/Restore](BACKUP-RESTORE.md). PITR erfordert Base Backup und archivierte WAL-Dateien; ein produktiver PITR-Anbieter ist nicht durch lokale Tests belegt. Restore nur in explizit freigegebene isolierte Ziele. Für Performance zunächst Query-Plan, Indizes, Poolauslastung und langsame Abfragen prüfen; keine ungezielten Produktionsupdates.
