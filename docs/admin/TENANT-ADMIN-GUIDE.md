# Tenant-Admin-Handbuch

TENANT_ADMIN ist auf den eigenen Tenant beschränkt. Typischer Ablauf: Benutzer anlegen/einladen und Rolle setzen, Properties/Buildings/Units erfassen, Meter und Devices zuordnen, danach Dashboards, Reports, Rules und WorkOrders verwenden. Geräte-/Gateway-, Profile-, Tarif-, Commissioning- und Meter-Replacement-Seiten stehen nur dort zur Verfügung, wo der jeweilige Serverpfad die Rolle zulässt.

API Keys und Webhooks werden über die vorhandenen Verwaltungsseiten/API tenantgebunden mit Scope, Ablauf, Rotation und Widerruf verwaltet. Exporte beachten Tenant-/Property-Grants. Audit/History ist nur über die vorhandenen Ansichten verfügbar; dieses Handbuch behauptet keine vollständige Tenant-Admin-Auditkonsole.

Vor Credential-Rotation, API-Key-Widerruf, Webhook-Secret-Rotation, Export oder Remote-Aktion Tenant und Zielressource prüfen. Cross-Tenant-Zugriff, freie Tenant-ID-Übernahme und unberechtigte Supportaktionen werden serverseitig abgelehnt. Audit- und Security-Ereignisse nicht löschen oder umgehen.
