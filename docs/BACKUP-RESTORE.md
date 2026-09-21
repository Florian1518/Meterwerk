# Backup, Restore und PITR

`pnpm db:backup backup .local/backups/meterwerk.dump` erzeugt einen PostgreSQL-Custom-Dump mit restriktiven Dateirechten und SHA-256-Prüfsumme. `pnpm db:backup verify <datei>` prüft Format, Prüfsumme und Restore-TOC. `pnpm db:backup restore <datei> meterwerk_restore_20260921` restauriert ausschließlich in eine neue Datenbank; die Produktivdatenbank wird nie überschrieben.

Für Production werden regelmäßige verschlüsselte Full Backups, PostgreSQL-WAL-Archivierung und Point-in-Time-Recovery in einem getrennten Storage benötigt. Backups werden nach vertraglicher Aufbewahrung verschlüsselt, versioniert und gelöscht. Schlüssel liegen außerhalb der Datenbank.

Ein Backup gilt erst nach regelmäßigem Restore-Test in einer isolierten Datenbank als zuverlässig. Der Test umfasst Migrationstand, Prüfsumme, `pg_restore --list`, Anwendungstart und einen stichprobenartigen Tenant-/Messwertvergleich. Docker-/PostgreSQL-Zugangsdaten werden ausschließlich über den Secret Provider injiziert.
