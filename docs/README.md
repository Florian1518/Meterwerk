# Meterwerk-Dokumentation

- [README](../README.md) – Einstieg und Schnellstart
- [ARCHITECTURE](ARCHITECTURE.md) – Komponenten und Datenfluss
- [DEVELOPMENT](DEVELOPMENT.md) – Installation, Migrationen und Entwicklung
- [ENVIRONMENT](ENVIRONMENT.md) – sichere Variablenreferenz
- [OPERATIONS](OPERATIONS.md) – Betrieb, Health, Worker und Backups
- [TROUBLESHOOTING](TROUBLESHOOTING.md) – Diagnose und sichere Maßnahmen
- [TESTING](TESTING.md) – Unit, Integration, Security, Browser und DR
- [SECURITY](SECURITY.md) – Security-Modell und Hardening
- [DISASTER-RECOVERY](DISASTER-RECOVERY.md) – Backups, Restore und DR
- [STAGING-DEMO](STAGING-DEMO.md) – getrennte Demo-/Staging-Umgebungen
- [PUBLIC-API](PUBLIC-API.md) – Public API und OpenAPI
- [WEBHOOKS](WEBHOOKS.md) – Signaturen, Retry und Rotation
- [EDGE-GATEWAY-OPERATIONS](EDGE-GATEWAY-OPERATIONS.md) – Gateway-Betrieb
- [DEVICE-MANAGEMENT](DEVICE-MANAGEMENT.md) – Devices, Credentials und Rollouts
- [HARDWARE-COMMISSIONING](HARDWARE-COMMISSIONING.md) – vorbereitete Inbetriebnahme
- [PROTOCOLS](PROTOCOLS.md) – Protokollübersicht
- [RELEASES](RELEASES.md) – Releases und RC-Freigabe

## Benutzer und Betrieb

- [User Guide](user/USER-GUIDE.md), [Rules/Alarme](user/RULES-AND-ALARMS.md), [Reporting](user/REPORTING.md), [Analytics](user/ANALYTICS.md), [Mobile/PWA](user/MOBILE-PWA.md)
- [Tenant Admin](admin/TENANT-ADMIN-GUIDE.md), [SUPER_ADMIN](admin/SUPER-ADMIN-GUIDE.md), [Device Management](admin/DEVICE-MANAGEMENT.md), [Integrations](admin/INTEGRATIONS.md)
- [Technician](technician/TECHNICIAN-GUIDE.md), [Commissioning](COMMISSIONING.md), [Meter Replacement](METER-REPLACEMENT.md)
- [Customer Onboarding](onboarding/CUSTOMER-ONBOARDING.md), [Pilot](onboarding/PILOT-ONBOARDING.md), [Offboarding](onboarding/TENANT-OFFBOARDING.md)
- [Support](support/SUPPORT-GUIDE.md), [Incidents](support/INCIDENT-MANAGEMENT.md), [Operations Procedures](OPERATIONS-PROCEDURES.md)
- [Demo Guide](DEMO-GUIDE.md), [Glossary](GLOSSARY.md), [Checklists](checklists/NEW-TENANT-CHECKLIST.md)

## Vollständige Navigation

### Getting Started und Architektur

- [README](../README.md) · [Entwicklung](DEVELOPMENT.md) · [Architecture](ARCHITECTURE.md) · [Environment](ENVIRONMENT.md) · [Capabilities](CAPABILITIES.md) · [Known Limitations](KNOWN-LIMITATIONS.md) · [Glossary](GLOSSARY.md)
- [Software Acceptance](SOFTWARE-ACCEPTANCE.md) · [RC Checklist](checklists/RC-ACCEPTANCE-CHECKLIST.md) · [Acceptance Report](acceptance/SOFTWARE-ACCEPTANCE-RESULT.md)

### Datenbank, MQTT und Geräte

- [Database](DATABASE.md) · [MQTT](MQTT.md) · [Workers](WORKERS.md) · [Edge Gateway](EDGE-GATEWAY-OPERATIONS.md) · [Device Management](DEVICE-MANAGEMENT.md) · [Protokolle](PROTOCOLS.md) · [Commissioning](COMMISSIONING.md) · [Meter Replacement](METER-REPLACEMENT.md)

### User und Administration

- [User](user/USER-GUIDE.md) · [Analytics](user/ANALYTICS.md) · [Reporting](user/REPORTING.md) · [Rules/Alarms](user/RULES-AND-ALARMS.md) · [PWA](user/MOBILE-PWA.md)
- [Tenant Admin](admin/TENANT-ADMIN-GUIDE.md) · [Super Admin](admin/SUPER-ADMIN-GUIDE.md) · [Integrations](admin/INTEGRATIONS.md) · [Technician](technician/TECHNICIAN-GUIDE.md)

### Onboarding, Support und Operations

- [Customer Onboarding](onboarding/CUSTOMER-ONBOARDING.md) · [Pilot Onboarding](onboarding/PILOT-ONBOARDING.md) · [Offboarding](onboarding/TENANT-OFFBOARDING.md)
- [Support](support/SUPPORT-GUIDE.md) · [Incidents](support/INCIDENT-MANAGEMENT.md) · [Operations Procedures](OPERATIONS-PROCEDURES.md) · [Responsibilities](RESPONSIBILITIES.md) · [Troubleshooting](TROUBLESHOOTING.md)

### Betrieb, Security, DR und Releases

- [Deployment](DEPLOYMENT.md) · [Upgrade](UPGRADE.md) · [Rollback](ROLLBACK.md) · [Releases](RELEASES.md) · [Monitoring](MONITORING.md)
- [Security](SECURITY.md) · [Security Checklist](SECURITY-CHECKLIST.md) · [Threat Model](THREAT-MODEL.md) · [Security Runbooks](SECURITY-RUNBOOKS.md)
- [Disaster Recovery](DISASTER-RECOVERY.md) · [Recovery Runbook](RECOVERY-RUNBOOK.md) · [DR Drills](DR-DRILLS.md) · [Backup/Restore](BACKUP-RESTORE.md)
- [Staging](STAGING.md) · [Staging/Demo](STAGING-DEMO.md) · [Demo Guide](DEMO-GUIDE.md)

### API, Tests und Checklisten

- [Public API](PUBLIC-API.md) · [OpenAPI Schema](openapi/public-api-v1.yaml) · [Webhooks](WEBHOOKS.md) · [Testing](TESTING.md)
- Checklisten: [Tenant](checklists/NEW-TENANT-CHECKLIST.md) · [Pilot](checklists/PILOT-READINESS-CHECKLIST.md) · [Release](checklists/RELEASE-CHECKLIST.md) · [Incident](checklists/INCIDENT-CHECKLIST.md) · [Backup](checklists/BACKUP-CHECKLIST.md) · [Offboarding](checklists/CUSTOMER-OFFBOARDING-CHECKLIST.md)

Dokumentation gehört zur Softwareversion im selben Git-Commit. Für Betriebsentscheidungen Release/Commit-SHA notieren; Versionsnummern müssen nicht einzeln in jeder Seite dupliziert werden.
