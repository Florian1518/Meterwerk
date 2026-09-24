# Rollback

Bei einem fehlgeschlagenen Staging- oder Release-Gate wird die Promotion gestoppt. Web- und Worker-Container werden auf das vorherige geprüfte Image mit Digest zurückgesetzt; Build-Metadaten und Konfiguration werden aus demselben Release verwendet.

Prisma-Migrationen werden nicht automatisch rückwärts ausgeführt. Vor riskanten Änderungen ist ein verifiziertes Backup erforderlich. Bei nicht rückwärtskompatiblen Änderungen erfolgt die Wiederherstellung ausschließlich über den dokumentierten separaten Restore-/PITR-Prozess. Es gibt keinen automatischen Datenbank-Reset und keine automatische Datenvernichtung.
