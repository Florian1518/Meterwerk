# Staging

Die Repository-Konfiguration enthält `compose.staging.yaml`, Smoke-Script und Environment Guards. Der Compose-Stack ist derzeit **nicht als lauffähiger Gesamtstack validiert**: Worker-Images/Entrypoints und Storage-Variablen sind nicht auf die tatsächlichen Implementierungen abgestimmt. Deshalb die Datei nicht als erfolgreiche Staging-Anleitung oder Promotion-Gate behandeln. Bekannte Punkte: [Known Limitations](KNOWN-LIMITATIONS.md).

Vor einem Staging-Lauf ist zunächst ein unveränderliches Web-Image und ein korrekt gebautes Worker-Image mit dessen tatsächlichem Entrypoint bereitzustellen. Externe Variablen müssen zu den in `src/server/` gelesenen Namen passen; das aktuelle Compose-Beispiel setzt teils andere Namen. PostgreSQL, MQTT, Storage, Mail, API-/Webhook-Schlüssel und Backup-Ziele müssen nachweislich ausschließlich Staging-Ressourcen sein. Keine produktiven Kunden oder Secrets importieren.

Lokale statische Checks:

    pnpm env:check
    pnpm smoke:staging

`pnpm smoke:staging` benötigt einen expliziten `SMOKE_BASE_URL` zu einer isolierten, bereits laufenden Umgebung. Es prüft HTTP-Endpunkte und ersetzt weder Deployment noch E2E oder Providerprüfung.

## RC-Freigabe

Der CI-Workflow prüft Build und Tests. Der Release-Workflow erzeugt Release-Artefakt und SBOM; er führt kein Staging- oder Produktionsdeployment aus. Sobald ein Staging-Stack korrekt provisioniert und getestet ist, RC-SHA, Migrationen, Readiness, Worker, Smoke, E2E, Security Guards und Demo Acceptance gemeinsam dokumentieren. Production Promotion erfolgt getrennt, manuell und mit expliziter Freigabe. Keine Restart- oder Docker-Drills als bestanden ausgeben, wenn sie nicht tatsächlich gelaufen sind.
