# Bekannte Einschränkungen

Diese Liste beschreibt Einschränkungen, die sich aus aktuellem Code und Repository-Konfiguration ergeben. Sie ist keine Zusage, dass jeder Providerbetrieb getestet wurde.

- Reale Zähler, physische RS485/Modbus RTU, M-Bus/W-MBus, Pulse, LoRaWAN-Netze und Hersteller-APIs wurden nicht als Hardwarevalidierung nachgewiesen.
- S3-kompatible Storage-Abstraktion ist vorhanden, aber ein konkreter externer Provider, Versionierung, Restore und Ende-zu-Ende-Berechtigungsbetrieb müssen noch validiert werden.
- PITR benötigt WAL-Archivierung und Provider-Infrastruktur; keine produktive PITR-Prüfung pauschal belegt.
- Backup-Metadaten/DR-Workflows sind teilweise vorhanden, aber `scripts/backup.ts` ist kein nachgewiesener produktiver, persistenter Backup-Scheduler. Schedulerbetrieb, Alerting und vollständiger isolierter Restore-Drill sind umgebungsabhängig/offen.
- `compose.staging.yaml` wurde auf getrennte Web-/Worker-Images, reale Laufzeitvariablen und private persistente lokale Attachments korrigiert. Der Stack wurde mangels laufendem Docker-Daemon nicht gestartet; vollständige Staging-Readiness bleibt unvalidiert.
- Mail-Implementierung stellt eine lokale In-Memory-Outbox bereit; SMTP/API-Providerzustellung und dauerhafte Mail-Sandbox sind nicht implementiert. Push-Providerbetrieb ebenfalls providerabhängig.
- Readiness prüft nicht automatisch alle Worker, MQTT und Storage gleichzeitig. Externe Metrik-/Alertplattform ist nicht mit der Anwendung gleichzusetzen.
- Release Workflow baut/verpackt Artefakte und SBOM; automatische Staging- oder Production-Deployment-Promotion ist nicht implementiert.
- Empirische Last-/Performance- und Hochverfügbarkeitstests in produktionsähnlicher Umgebung sind nicht belegt.
- Die Environment Guards erkennen offensichtliche bekannte Endpunktmuster, ersetzen aber keine vollständige Secret-/Netzwerkisolation. Jede Umgebung benötigt getrennte Ressourcen und externe Freigabe.

Vor Pilot/Produktion offene Punkte anhand [CAPABILITIES.md](CAPABILITIES.md), [Production Checklist](SECURITY-CHECKLIST.md), [Deployment](DEPLOYMENT.md) und [Staging](STAGING.md) abarbeiten.
