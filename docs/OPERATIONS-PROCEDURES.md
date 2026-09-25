# Häufige Betriebsabläufe

- **Tenant/Benutzer:** Plattform-/Tenantverwaltung öffnen, Tenant explizit wählen, Benutzer einladen, Rolle und Property-Grants prüfen.
- **API Key:** eigenen Tenant wählen, Scope/Ablauf setzen, Secret einmal sicher anzeigen, später rotieren oder widerrufen.
- **Webhook:** Ziel und Events validieren, Secret einmal sicher speichern, Delivery/Retry prüfen, bei Verdacht rotieren.
- **Device/Gateway:** Health, Tenant, Profile und Credentialstatus prüfen; Rotation auditieren.
- **Worker/Queue:** Operations öffnen, Heartbeat/Lease/Failed Jobs prüfen, keinen Blind-Replay ausführen.
- **Maintenance:** nur privilegiert und mit Audit; vorher Auswirkungen und Recovery prüfen.
- **Backup/Restore:** Recovery-Metadaten, Status und Restore-Test anzeigen; Restore nur isoliert und privilegiert.
- **Demo/Staging:** `pnpm demo:seed`, `pnpm demo:verify`, `pnpm demo:reset` nur mit Guards; Staging Readiness und Release Status dokumentieren.
