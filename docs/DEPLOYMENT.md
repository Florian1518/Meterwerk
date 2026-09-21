# Pilot- und Produktionsdeployment

## Start

```sh
cp .env.example .env.production
# Werte über Secret-Provider setzen, niemals committen
docker compose -f compose.production.yaml --env-file .env.production build
docker compose -f compose.production.yaml --env-file .env.production up -d
curl -fsS https://app.meterwerk.de/api/health/ready
```

Für einen Pilot-Stack kann `compose.pilot.yaml` verwendet werden. Der MQTT-Broker wird nur im internen Compose-Netz veröffentlicht. PostgreSQL läuft vorzugsweise managed; bei eigener Ausführung wird das bestehende `compose.yaml` mit einem persistenten Volume und Backup-Job verwendet.

## Betrieb

Images sind unveränderlich versioniert (`METERWERK_IMAGE=meterwerk/app:<git-sha>`). Keine Secrets werden in Dockerfiles, Images, Logs oder Health-Antworten eingebettet. Restart-Policies, Healthchecks und persistente MQTT-Volumes sind im Produktions-Compose enthalten. Vor jedem Update: Backup, Migration, Healthcheck, Smoke-Test; bei Fehlern Image-Rollback ohne automatische DB-Rückmigration.
