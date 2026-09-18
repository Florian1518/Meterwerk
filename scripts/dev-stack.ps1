Write-Host "Docker is required for PostgreSQL and Mosquitto."
docker compose up -d --wait db mqtt
if ($LASTEXITCODE -ne 0) { throw 'Docker services are not healthy.' }
Write-Host "Run in separate terminals:"
Write-Host "  pnpm db:generate; pnpm db:migrate; pnpm db:seed; pnpm db:seed:edge"
Write-Host "  pnpm dev"
Write-Host "  pnpm mqtt-worker"
Write-Host "  pnpm modbus-simulator"
Write-Host "  pnpm edge-gateway"
