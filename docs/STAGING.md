# Staging

Staging verwendet `compose.staging.yaml`, eine getrennte PostgreSQL-Datenbank, MQTT, Web, Rules Worker und Rollout Worker. Produktions-Credentials und Produktionskunden sind ausgeschlossen.

```powershell
$env:STAGING_POSTGRES_PASSWORD = "local-only"
$env:STAGING_SESSION_SECRET = "local-staging-secret"
$env:METERWERK_IMAGE = "meterwerk/app:staging"
docker compose -f compose.staging.yaml up -d
docker compose -f compose.staging.yaml run --rm web node node_modules/prisma/build/index.js migrate deploy
node scripts/smoke-staging.mjs
docker compose -f compose.staging.yaml logs -f web rules-worker rollout-worker
docker compose -f compose.staging.yaml down
```

Images werden über einen unveränderlichen Tag oder Digest referenziert; `latest` ist keine Produktionsreferenz. Health Gates prüfen Web, Datenbank, MQTT, Worker, API und Smoke Tests vor einer Promotion.
