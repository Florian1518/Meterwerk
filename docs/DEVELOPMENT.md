# Entwicklerhandbuch

## Voraussetzungen und Installation

Node.js 22.12+, pnpm 12, Git und optional Docker Desktop mit Linux-Containern. Unter PowerShell werden die unten gezeigten `pnpm`-Befehle direkt ausgeführt; CMD verwendet dieselben Befehle, Environment-Variablen werden dort mit `set NAME=value` gesetzt.

```text
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm db:local                 # oder: docker compose up -d db mqtt
pnpm db:generate
pnpm db:migrate
pnpm db:seed                  # nur mit SEED_DEMO=true und sicherer lokaler DB
pnpm dev
```

Lokale Ports: Web 3000, PostgreSQL 5432, MQTT 1883, Modbus-Simulator 1502. `db:local` speichert lokal und wird mit Strg+C beendet. Nie gleichzeitig `db:local` und den Compose-PostgreSQL starten.

## Entwicklung und Datenbank

Fachlicher Zugriff liegt unter `src/server/`. Schemaänderungen werden als Prisma-Migration versioniert: `pnpm db:generate`, `pnpm db:migrate`. Kein `db push` gegen gemeinsam genutzte Datenbanken. Demo-Seeding benötigt `SEED_DEMO=true`, `DEMO_PASSWORD` und eine explizite DEMO/TEST-Umgebung; `pnpm demo:reset` verlangt zusätzlich die dokumentierte Bestätigung.

## Prüfungen

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:integration`, `pnpm security:regression`, `pnpm security:secrets`, `pnpm build`, `pnpm demo:verify-all` (nur DEMO/TEST mit Datenbank). `pnpm test:e2e` benötigt einen laufenden Browser-/Web-Stack. `pnpm test:mqtt-tls` und Gateway-/Modbus-Skripte sind lokale Simulatorprüfungen.

## Docker und Worker

`docker compose up -d db mqtt` startet lokale Basissysteme. `compose.staging.yaml` ist strikt getrennt und benötigt eigene Staging-Variablen. Worker werden mit `pnpm mqtt-worker`, `pnpm rules-worker` oder den jeweils dokumentierten Compose-Kommandos gestartet. Keine Produktions-Credentials in `.env`, Compose oder Logs speichern.
