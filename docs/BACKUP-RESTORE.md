# PostgreSQL Backup und Restore

Lokale Compose-Installation und Pilot mit PostgreSQL 17: konsistente logische Sicherung mit `pg_dump -Fc`. Der Scriptzugriff erfolgt über den lokalen db-Container; keine Datenbankpasswörter als Kommandozeilenargument. Das Script ist auf Compose-Service `db`, Datenbank/Benutzer `meterwerk` ausgelegt. Für externes PostgreSQL die untenstehenden Standardwerkzeuge mit geschützter `.pgpass`/Servicekonfiguration verwenden.

```powershell
pnpm db:backup backup .local/backups/pilot-2026-09-18.dump
pnpm db:backup verify .local/backups/pilot-2026-09-18.dump
pnpm db:backup restore .local/backups/pilot-2026-09-18.dump meterwerk_restore_abnahme
```

Backup erzeugt ein Custom-Archiv und eine SHA-256-Prüfsumme. Vorhandene Dateien werden nicht überschrieben. Verify prüft Prüfsumme, Archivkennung und `pg_restore --list`. Das prüft Lesbarkeit, ersetzt aber keinen tatsächlichen Restore. Bei fehlgeschlagenem Backup unvollständige Dateien lokal untersuchen und einen neuen Dateinamen verwenden.

Restore erlaubt nur einen **neuen**, noch nicht existierenden Datenbanknamen `meterwerk_restore_*`. `createdb` bricht bei vorhandener Datenbank ab; es gibt kein `--clean` und keinen automatischen Restore in die laufende Datenbank. Import erfolgt mit `--single-transaction --exit-on-error --no-owner --no-acl`. Eine bei fehlgeschlagenem Restore neu angelegte leere Datenbank bleibt zur Untersuchung bestehen. Nach Erfolg Tabellen, Mandanten-/Messwertzahlen, neueste Messzeitpunkte und Stichproben mit dem Sicherungszeitpunkt vergleichen. Anschließend Anwendung gegen die isolierte Restore-Datenbank testen; keinen produktiven Ingestion-Worker parallel darauf starten.

Für andere Installationen entsprechen die Schritte `pg_dump -Fc --no-owner --no-acl`, `pg_restore --list`, `createdb` und `pg_restore --single-transaction --exit-on-error`. Rollen/Berechtigungen werden bewusst nicht als Superuser-Definitionen wiederhergestellt; das Zielkonto und minimale App-/Migrationsrollen separat einrichten. Referenz: [PostgreSQL 17 Restore](https://www.postgresql.org/docs/17/app-pgrestore.html).

Pilotvorschlag: mindestens täglich sichern, sieben tägliche und vier wöchentliche Stände behalten; gewünschtes RPO/RTO mit Betreiber festlegen. Das Script führt keine automatische Aufbewahrung aus. Sicherungen enthalten sensible Mandantendaten und Credential-Metadaten: verschlüsselt auf separatem Datenträger/Host aufbewahren, Zugriff und Schlüssel sichern. Hashdatei allein schützt nicht gegen absichtliche Manipulation beider Dateien. Monatlichen Restore-Test und vor Updates eine zusätzliche Sicherung einplanen. Eine lokale Kopie auf derselben Platte ist kein Ausfallschutz.

Gateway-Queue, lokale Konfiguration, TLS-/Receipt-Schlüssel und CA-Betrieb separat sichern; diese liegen absichtlich nicht in PostgreSQL. Vor Umschalten einer wiederhergestellten Datenbank Worker stoppen, Nachrichten-/Queue-Zustand prüfen, Zugangsdaten und App-Ziel explizit umstellen und anschließend Duplikatschutz/Replay kontrollieren. Für engere Wiederherstellungsziele später WAL-Archivierung/PITR ergänzen; in Phase 4b ist keine Cloud-Backup-Infrastruktur enthalten.
