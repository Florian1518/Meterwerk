# Meterwerk Produktion

Meterwerk wird im Pilotbetrieb als nicht exponierter Next.js-Container hinter einem TLS-Reverse-Proxy betrieben. `compose.production.yaml` startet App, MQTT und den separaten Worker; PostgreSQL wird als Managed Service oder als extern gepflegter Dienst über `DATABASE_URL` angebunden. Secrets kommen ausschließlich über `METERWERK_ENV_FILE` oder den Secret-Provider des Orchestrators.

## HTTPS und Caddy

Beispiel für `/etc/caddy/Caddyfile`:

```caddy
app.meterwerk.de {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000 {
    header_up X-Forwarded-Proto https
    header_up X-Forwarded-Host {host}
  }
}
```

Der App-Port bleibt intern (`expose`, kein öffentliches `ports`). Caddy übernimmt TLS, HTTP-Redirect, sichere Forwarded-Header und WebSocket-Upgrade. `TRUSTED_HOSTS` enthält nur die freigegebenen Domains; Tenant-Zugriff wird immer serverseitig aus Session und Rollen geprüft.

## Update und Rollback

1. Wartungsfenster und Backup/PITR-LSN dokumentieren.
2. Neues Image bauen und signieren.
3. `pnpm db:migrate` als vorwärtskompatible Migration ausführen.
4. App/Worker mit neuer Image-Version starten.
5. `/api/health/ready` und Smoke-Tests prüfen.
6. Bei App-Fehlern auf das vorherige Image zurückrollen. Datenbankmigrationen werden nicht automatisch rückwärts migriert; dafür gibt es einen geprüften Restore auf eine neue Datenbank oder eine explizite Forward-Fix-Migration.

Rollback darf erst nach einem Restore-Test als abgeschlossen gelten. Die genaue Backup-Prozedur steht in [BACKUP-RESTORE.md](BACKUP-RESTORE.md).
