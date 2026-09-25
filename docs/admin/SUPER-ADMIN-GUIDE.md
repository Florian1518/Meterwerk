# SUPER_ADMIN-Handbuch

SUPER_ADMIN muss für kundengebundene Arbeit einen Tenant ausdrücklich auswählen. Plattformüberblick, Tenantverwaltung, Operations, Fleet/Devices, Support, Incidents, Recovery-Metadaten, DR, Staging/Demo, Build-/Releaseinformationen, Worker und Queues sind über die jeweils vorhandenen Ansichten/Endpunkte verfügbar. Sichtbarkeit eines Status bedeutet nicht automatisch, dass jede Betriebsaktion aus der UI ausführbar ist. Jede Supportaktion muss Tenant und Zweck dokumentieren.

Hochprivilegiert und auditpflichtig sind Restore/PITR, Backup-Löschung, Credential-/API-Key-/Webhook-Rotation, Demo-Reset, Maintenance Mode, Cross-Tenant-Diagnose und sensible Supportaktionen. Keine Sicherheitskontrollen umgehen und keine Produktionsdaten mit Demo-/Reset-Befehlen verändern. Siehe [Security](../SECURITY.md), [Operations](../OPERATIONS.md) und [DR](../DISASTER-RECOVERY.md).
