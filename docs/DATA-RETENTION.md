# Aufbewahrung und Datenschutz

| Datenart        | Policy-Entscheidung                                                     |
| --------------- | ----------------------------------------------------------------------- |
| Messwerte       | fachlich/vertraglich festlegen; keine automatische Löschung in Phase 5d |
| Audit Logs      | unveränderlich aufbewahren, Zeitraum vor Betrieb festlegen              |
| technische Logs | kurze, konfigurierbare Frist; keine Payloads oder Secrets               |
| Benutzerkonten  | deaktivieren/anonymisieren nach Prüfung von Nachweispflichten           |
| Reports         | tenantgebunden, Aufbewahrung vorab festlegen                            |
| Attachments     | tenantgebunden, Ablauf/Legal Hold vor Löschung prüfen                   |
| Backups/WAL     | verschlüsselt und getrennte, dokumentierte Aufbewahrung                 |

Tenant-Exporte sind für berechtigte Administratoren vorhanden. Eine automatische DSGVO-Löschung wird nicht ausgelöst, solange Mess-, Abrechnungs- oder Nachweispflichten ungeklärt sind. Supportzugriffe müssen zeitlich begrenzt, tenantbezogen autorisiert und auditiert werden.
