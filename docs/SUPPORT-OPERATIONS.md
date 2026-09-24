# Support & Operations (Phase 5o)

Supportfälle sind tenantgebunden und besitzen Kategorie, Priorität, Status und eine chronologische Timeline. Interne Notizen werden serverseitig von Kundenkommentaren getrennt. Tenant-Administratoren verwalten eigene Fälle; Plattformadministratoren können einen Tenant explizit auswählen.

`/support` und `/support/[id]` bieten Suche, Filter und Fallhistorie. `/operations` zeigt den vorhandenen Systemstatus. Tenant-Diagnostics und Diagnostic Bundles enthalten nur technische Metadaten, Status, Zähler und begrenzte Auditdaten; Secrets, Tokens, Passwörter und Credential-Material werden nicht exportiert.

Support Actions verwenden eine feste Allowlist und eine Request-ID zur Idempotenz. Sie erzeugen AuditEvents und führen keine Shell- oder beliebigen Datenbankaktionen aus. Maintenance Mode ist SUPER_ADMIN-only, tenantbezogen oder global und löscht keine Daten.

Die Migration `202609240018_support_operations` ist versioniert. Lokales PostgreSQL war bei der Implementierung nicht erreichbar (`P1001`/`ECONNREFUSED`); deshalb wurden keine Migrationen erzwungen und keine Datenbank zurückgesetzt. Integrationstests benötigen eine erreichbare PostgreSQL-Instanz.

## Incidents, SLA und Operations-Metriken

Incidents besitzen Severity, Status, Scope, Komponenten, Ursache, Lösung und eine unveränderliche Timeline. Tenant- und Plattformzugriffe werden getrennt geprüft. SLA-Policies speichern Response- und Resolution-Ziele pro Tenant und Severity; die verbleibende Zeit und Verletzungen werden regelbasiert berechnet.

Operations-Metriken unterstützen 15 Minuten, Stunde, 24 Stunden und 7 Tage. Queue-Retries verwenden feste Queue-Typen und Correlation IDs zur Idempotenz. `/operations`, `/api/operations/metrics`, `/api/operations/queue` und `/api/operations/sla` stellen nur tenant- bzw. plattformberechtigte Statusdaten bereit. Notification-Ereignisse werden mit Cooldown in AuditEvents dedupliziert.

Support- und Incident-Formulare verwenden die serverseitigen Zod-, Rollen- und Tenant-Prüfungen. Mailzustellung nutzt den vorhandenen providerneutralen `sendMail`-Adapter; mit lokalem Provider wird nur die lokale Outbox befüllt, ein produktiver Versand wird nicht behauptet. Retry-Aktionen bleiben auditierbare, idempotente Queue-Anforderungen mit Correlation ID und Retry-Limit.

Retention ist als konfigurierbare Betriebsregel vorzubereiten; AuditEvents und Incident-Timelines werden nicht still gelöscht. Backup-/Restore-Operationen verwenden die bestehende separate Restore-Datenbank- und Prüfsummenlogik. Detaillierte Wiederherstellungsschritte stehen in `docs/RUNBOOKS.md`.
