# Staging

Die Repository-Konfiguration enthält `compose.staging.yaml`, Smoke-Script und Environment Guards. Compose verwendet getrennte Web-/Worker-Images, die tatsächliche MQTT-Variable und ein persistentes privates Attachment-Volume. Der Stack ist **nicht zur Laufzeit validiert**; bis Readiness- und Smoke-Tests gegen eine isolierte Umgebung gelaufen sind, gilt er nicht als bestandenes Promotion-Gate. Bekannte Punkte: [Known Limitations](KNOWN-LIMITATIONS.md).

Vor einem Staging-Lauf sind unveränderliche Web- und Worker-Images bereitzustellen; das Worker-Image wird mit `Dockerfile.worker` gebaut. Setze `METERWERK_IMAGE`, `METERWERK_WORKER_IMAGE`, `STAGING_POSTGRES_PASSWORD`, `STAGING_SESSION_SECRET` und den Pfad `STAGING_MQTT_RECEIPT_KEY` zu einem eigens für Staging verwalteten privaten Receipt-Key. `STAGING_APP_URL` ist die externe Origin (lokal standardmäßig `http://localhost:3000`). PostgreSQL/MQTT sind im isolierten Compose-Netz; Attachments liegen im persistenten privaten Volume. Mail ist eine lokale In-Memory-Outbox, kein externer Sandbox-Provider. Externe API-/Webhook- und Backup-Ziele müssen separat von Production sein. Keine produktiven Kunden oder Secrets importieren.

Lokale statische Checks:

    pnpm env:check
    pnpm smoke:staging

`pnpm smoke:staging` benötigt einen expliziten `SMOKE_BASE_URL` zu einer isolierten, bereits laufenden Umgebung. Es prüft HTTP-Endpunkte und ersetzt weder Deployment noch E2E oder Providerprüfung.

## RC-Freigabe

Der CI-Workflow prüft Build und Tests. Der Release-Workflow erzeugt Release-Artefakt und SBOM; er führt kein Staging- oder Produktionsdeployment aus. Sobald ein Staging-Stack korrekt provisioniert und getestet ist, RC-SHA, Migrationen, Readiness, Worker, Smoke, E2E, Security Guards und Demo Acceptance gemeinsam dokumentieren. Production Promotion erfolgt getrennt, manuell und mit expliziter Freigabe. Keine Restart- oder Docker-Drills als bestanden ausgeben, wenn sie nicht tatsächlich gelaufen sind.
