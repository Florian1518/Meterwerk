# Device Management (Phase 5n)

Die Geräteverwaltung bündelt Devices, Gateways, Zähler und Device Profiles in einer tenantgebundenen Inventarliste. Ein Device bleibt mit dem bestehenden Meter-, Gateway-, Reading- und GatewayCommand-Modell verbunden; es gibt keine parallele Provisioning- oder Hardwareintegration.

## Lifecycle und Provisioning

Serverseitig erlaubte Lifecycle-Status sind `NEW`, `PROVISIONING`, `ACTIVE`, `OFFLINE`, `MAINTENANCE`, `DECOMMISSIONED` und `FAILED`. Übergänge werden geprüft und als `AuditEvent` geschrieben. Provisioning-Jobstatus und Fehler werden aus den vorhandenen `GatewayCommand`-Einträgen angezeigt. Diese Anwendung löst keine reale Kommunikation aus.

## Konfiguration und Firmware

Konfigurationen werden als strikt validierte, versionierte JSON-Daten gespeichert: Polling-Intervall, Kommunikationsparameter, Register-/Channel-Mapping, Einheiten, Skalierung und Thresholds. Frei ausführbare Skripte sind ausgeschlossen; alte Versionen bleiben erhalten. Firmwarefelder bilden Ist-Version, Zielversion, Versuch und Fehler ab und sind Metadaten für spätere OTA-Abläufe.

## Credentials und Zugriff

Device-Credentials verwenden die bestehende Hash-/Token-Abstraktion. Listen und Detailseiten geben niemals Token oder Hashes aus. Rotation widerruft vorherige aktive Credentials. Jede Serverfunktion bestimmt den Mandanten selbst und prüft Property-Grants für USER-Zugriffe; Bulk-Aktionen akzeptieren ausschließlich IDs desselben Mandanten.

## Oberfläche

`/devices` bietet Suche, Status-/Herstellerfilter und Pagination. `/devices/[id]` zeigt Stammdaten, Zuordnungen, Provisioning, Konfiguration, Firmware, Credentials, Messwerte, Events und Wartungshistorie. Die Darstellung ist responsiv; Aktionen sind über JSON-APIs vorbereitet (`/api/devices`, `/api/devices/[id]/lifecycle`, `/api/devices/[id]/configuration`, `/api/devices/bulk`).

## Betrieb

Die Migration `202609240015_device_management` ist versioniert. Sie muss mit `prisma migrate deploy` in einer erreichbaren PostgreSQL-Umgebung angewendet werden. In der lokalen Umgebung war PostgreSQL nicht erreichbar (`P1001`/`ECONNREFUSED`); es wurde keine Datenbank zurückgesetzt oder Migration erzwungen.

## Gruppen, Compliance und Worker

Device Groups sind statisch oder verwenden ausschließlich strukturierte Filter. Compliance vergleicht Firmware, Profil, Konfigurationsversion, Credential und Provisioning und liefert erklärbare Abweichungen. Der Rollout-Worker verarbeitet geplante Ziele in Batches, erzeugt nur vorhandene GatewayCommands und ist durch persistente Rollout-/Target-Status neustartfähig. Pause, Resume, Cancel, Canary und Rollback-Metadaten werden gespeichert; Hardware-OTA findet nicht statt. Gateway Health wird über Heartbeat, Queue, Credentials, Commands und verbundene Devices bewertet.

Notifications verwenden deduplizierte Audit-/Notification-Ereignisse mit Cooldown. Diagnoseanhänge und Firmware-Binaries werden nicht öffentlich ausgeliefert; produktive Object-Storage- und Retention-Ausführung bleibt deploymentabhängig.

## Fleet Health und Teil 2

Die Fleet-Ansicht `/fleet` berechnet `HEALTHY`, `WARNING`, `CRITICAL` oder `UNKNOWN` regelbasiert aus Kontaktalter, Gerätestatus, Diagnosefehlern, offenen Alarmen, Credentials, Provisioning und Firmwarestatus. Diagnose- und Command-APIs verwenden vorhandene Messwerte, `ModbusDiagnostic` und `GatewayCommand`; sie senden keinen Ping. Zulässige Commands sind fest kodiert. Firmware-Rollouts speichern Zielgeräte, Batch-/Parallelgrenzen, Canary-Größe, Pause-Schwelle und Rollback-Metadaten. Wartungsfenster markieren die Health-Bewertung und löschen keine Alarme. Credential-Rotation zeigt das neue Secret nur in der einmaligen API-Antwort.
