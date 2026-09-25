# Staging und Demo

Meterwerk unterscheidet `development`, `test`, `staging`, `demo` und `production`. `METERWERK_ENV` ist die maßgebliche Kennzeichnung; Build-Version, Commit und Build-Zeitpunkt liefert `/api/system/build-info`. DEMO und STAGING werden sichtbar markiert, Production erhält keine Demo-Kennzeichnung.

`compose.staging.yaml` nutzt eigene PostgreSQL-, MQTT- und Object-Storage-Ressourcen sowie ein internes Netzwerk. Staging benötigt eigene Domains, API-/Webhook-Secrets, Mail-/Push-Testziele, Queues und Backup-Storage. Offensichtliche Produktions-Endpunkte werden durch Guards abgelehnt.

Für einen Demo-Lauf: `METERWERK_ENV=demo`, `DATABASE_URL` auf eine isolierte Datenbank, `DEMO_PASSWORD` setzen, `pnpm db:migrate`, `pnpm demo:seed`, `pnpm demo:verify`. Ein Reset erfordert zusätzlich `DEMO_RESET_CONFIRM=I_UNDERSTAND_DEMO_RESET` und ist ausschließlich für DEMO/TEST zulässig. Unbekannte oder produktionsähnliche Datenbanken werden abgelehnt.

Der deterministische Seed erzeugt synthetische Demo-Daten. Mail ist derzeit eine lokale In-Memory-Outbox; produktive SMTP/API-Zustellung oder persistente Mail-Sandbox ist nicht implementiert. Mock-Webhooks/Demo-Ziele dürfen keine Kundensysteme ansprechen. Push-Providerbetrieb und Staging-Compose bleiben bis zur separaten End-to-End-Prüfung offen; reale Hardware und Kundennachrichten sind ausgeschlossen.

`pnpm smoke:staging` prüft Live/Ready/Build-Info. Ein vollständiger Staging-Lauf ergänzt Login, Tenantzugriff, Dashboard, Analytics, Meter/Readings, Alarme, Rules, Devices, WorkOrders, Support, Reports, API und Worker Health.

## Promotion und Demo-Steuerung

Promotion folgt `Commit → CI → RC-Auswahl → Staging-Deployment → Migrationen → Worker → Demo-Verify → Smoke/E2E → Promotion-Status`. Es gibt keinen automatischen Produktionsrelease. `/platform-admin/demo` und `/api/platform/demo` erlauben berechtigten Admins die Szenarien NORMAL, HIGH_ELECTRICITY, WATER_LEAK, METER_OFFLINE, GATEWAY_OFFLINE, MISSING_DATA, OPEN_ALARM, ACKNOWLEDGED_ALARM, CRITICAL_ANOMALY, MAINTENANCE, METER_REPLACEMENT, SUPPORT_CASE und FIRMWARE_ROLLOUT. Aktivierung, Reset und Refresh funktionieren nur in DEMO/TEST und werden auditiert.

Demo-Daten werden relativ zu einem kontrollierten UTC-Referenzzeitpunkt erzeugt und bleiben durch den festen Seed reproduzierbar. Mail, Webhooks und Public API verwenden ausschließlich Sandbox-/Mock-Ziele, Demo-Tenant und begrenzte Scopes. Präsentationsseiten zeigen den DEMO-Banner weiterhin sichtbar; technische Details bleiben für berechtigte Admins zugänglich.

STAGING enthält technische synthetische Daten. DEMO enthält ausschließlich synthetische deterministische Daten. Stille Produktionskopien, Produktions-API-Keys, produktive Mail-Empfänger und echte Webhook-Ziele sind verboten.

## Readiness, Acceptance und RC

`evaluateStagingReadiness` prüft Web, DB, MQTT, Rules-/Device-Worker, Migrationstand, Build-Version und Git-SHA. Optionale Mail-, Report- und Storage-Komponenten führen bei Fehlern zu `DEGRADED`; fehlende Pflichtinformationen bleiben `UNKNOWN`. Promotion ist nur bei grüner CI, aktueller Migration, `READY`, erfolgreichem E2E, bestandenen Security-Guards und passenden Version/SHA freigabefähig.

`pnpm demo:verify-all` verlangt DEMO/TEST und eine explizite `DATABASE_URL`, führt Environment- und Demo-Verify aus und startet Smoke-Tests nur bei gesetztem `SMOKE_BASE_URL`. Alle 13 Szenarien werden durch die Scenario-Tests auf Aktivierbarkeit, Guard und reproduzierbare Rücksetzung geprüft. Der sichere Reset-/Recovery-Drill bleibt auf DEMO/TEST begrenzt; Staging/Production werden niemals gelöscht.

Vor einem RC werden Version, Git-SHA, Migration, Readiness, Smoke, E2E, Security-Guards, Demo-Acceptance und bekannte Findings dokumentiert. Restart- und Docker-Drills gelten nur nach tatsächlicher Ausführung als bestanden.
