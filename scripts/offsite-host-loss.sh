#!/usr/bin/env bash
set -euo pipefail
# Synthetic acceptance only: fresh nested Docker daemon, no host/production access.
host="meterwerk-offsite-host-${GITHUB_RUN_ID}"
stage="$RUNNER_TEMP/offsite-host-loss"
mkdir -m 700 "$stage"
cleanup_host() {
  docker rm -fv "$host" >/dev/null 2>&1 || true
  case "$stage" in "$RUNNER_TEMP"/offsite-host-loss) rm -rf -- "$stage" ;; *) return 1 ;; esac
}
trap cleanup_host EXIT
current_step='prepare release images'
trap 'rc=$?; printf "HOST_LOSS_FAILED_STAGE=%s\n" "$current_step" >&2; exit "$rc"' ERR
inner() { docker exec "$host" docker "$@"; }
mark() { printf '%s %s\n' "$1" "$(date -u +%s%3N)" >> "$stage/times"; }

# Prepare recoverable release artifacts outside the lost target, before timing.
# Existing application/worker Dockerfiles remain the source of runtime images.
docker build --build-arg GIT_SHA="$GITHUB_SHA" -t meterwerk-offsite-web:acceptance . > "$RUNNER_TEMP/offsite-web-build.log" 2>&1
docker build -f Dockerfile.worker --build-arg GIT_SHA="$GITHUB_SHA" -t meterwerk-offsite-worker:acceptance . > "$RUNNER_TEMP/offsite-worker-build.log" 2>&1
docker pull postgres:16 >/dev/null
docker pull eclipse-mosquitto:2 >/dev/null
docker pull docker:27-dind >/dev/null
docker save meterwerk-offsite-web:acceptance meterwerk-offsite-worker:acceptance postgres:16 eclipse-mosquitto:2 > "$stage/images.tar"
current_step='start isolated Docker daemon and verify it is empty'
docker run -d --privileged --name "$host" -e DOCKER_TLS_CERTDIR= \
  -p 127.0.0.1:5544:5544 -p 127.0.0.1:3100:3100 docker:27-dind >/dev/null
for attempt in $(seq 1 60); do
  if inner info >/dev/null 2>&1; then break; fi
  sleep 1
done
inner info >/dev/null
test -z "$(inner image ls -q)"
test -z "$(inner ps -aq)"
test -z "$(inner volume ls -q)"
mark start
current_step='load release images into isolated Docker daemon'
docker exec -i "$host" docker load < "$stage/images.tar" >/dev/null
for image in meterwerk-offsite-web:acceptance meterwerk-offsite-worker:acceptance postgres:16 eclipse-mosquitto:2; do
  inner image inspect "$image" >/dev/null
done
mark imagesReady
current_step='provide runtime configuration to isolated daemon'
docker exec -i "$host" sh -c 'cat > /tmp/mosquitto.conf' < infra/mosquitto/mosquitto.conf
docker exec -i "$host" sh -c 'cat > /tmp/receipt.pem' < "$RUNNER_TEMP/mqtt-receipt-private.pem"
docker exec "$host" test -s /tmp/mosquitto.conf
docker exec "$host" test -s /tmp/receipt.pem
docker exec "$host" chown 1000:1000 /tmp/receipt.pem
docker exec "$host" chmod 600 /tmp/receipt.pem
inner network create recovery >/dev/null
mark configurationReady
current_step='restore database service'
inner run -d --name db --network recovery -p 5544:5432 \
  -e POSTGRES_USER=meterwerk -e POSTGRES_PASSWORD=ci-only-recovery-password \
  -e POSTGRES_DB=meterwerk_restore_host_loss postgres:16 >/dev/null
for attempt in $(seq 1 60); do
  if inner exec db pg_isready -h 127.0.0.1 -U meterwerk -d meterwerk_restore_host_loss >/dev/null 2>&1; then break; fi
  sleep 1
done
inner exec db pg_isready -h 127.0.0.1 -U meterwerk -d meterwerk_restore_host_loss >/dev/null
mark databaseReady
# Remove the previous local backup and retrieve the pinned external versions anew.
current_step='retrieve pinned backup versions from IONOS'
rm -f "$METERWERK_BACKUP_FILE" "$METERWERK_BACKUP_MANIFEST"
export METERWERK_HOST_RETRIEVAL_DIR="$stage"
python3 - <<'PY'
import importlib.util, json, os
from pathlib import Path
spec = importlib.util.spec_from_file_location('storage', 'scripts/offsite-storage.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
try:
    store = m.Store()
    store.preflight()
    records = json.loads((Path(os.environ['RUNNER_TEMP']) / 'offsite-full.json').read_text())['objects']
    for record in records:
        store.get(record, Path(os.environ['METERWERK_HOST_RETRIEVAL_DIR']) / Path(record['key']).name)
except Exception:
    raise SystemExit('HOST_LOSS_OFFSITE_RETRIEVAL_FAILED')
PY
mark downloadAndHashComplete
current_step='decrypt encrypted backup'
backup="$stage/$(basename "$METERWERK_BACKUP_FILE")"
age -d -i "$METERWERK_BACKUP_AGE_IDENTITY_FILE" -o "$stage/restore.dump" "$backup"
mark ageDecryptionComplete
current_step='restore PostgreSQL dump'
cat "$stage/restore.dump" | \
  docker exec -i "$host" docker exec -i db pg_restore \
    -U meterwerk -d meterwerk_restore_host_loss --no-owner --no-acl --exit-on-error --single-transaction >/dev/null 2>&1
rm "$stage/restore.dump"
mark databaseRestored
current_step='start MQTT, web and ingestion worker'
inner run -d --name mqtt --network recovery \
  -v /tmp/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro eclipse-mosquitto:2 >/dev/null
inner run -d --name web --network recovery -p 3100:3000 \
  -e DATABASE_URL=postgresql://meterwerk:ci-only-recovery-password@db:5432/meterwerk_restore_host_loss \
  -e METERWERK_ENV=test -e APP_URL=http://127.0.0.1:3100 \
  -e SESSION_SECRET=ci-only-synthetic-session-secret meterwerk-offsite-web:acceptance >/dev/null
mark appStartup
inner run -d --name worker --network recovery \
  -e DATABASE_URL=postgresql://meterwerk:ci-only-recovery-password@db:5432/meterwerk_restore_host_loss \
  -e METERWERK_ENV=test -e NODE_ENV=test -e MQTT_BROKER_URL=mqtt://mqtt:1883 \
  -e MQTT_RECEIPT_KEY_PATH=/app/receipt.pem -v /tmp/receipt.pem:/app/receipt.pem:ro \
  meterwerk-offsite-worker:acceptance dist/mqtt-worker.js >/dev/null
current_step='wait for web readiness and MQTT worker subscription'
for attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:3100/api/health/ready >/dev/null \
    && inner logs worker 2>&1 | grep -q mqtt.subscribed; then break; fi
  sleep 2
done
curl --fail --silent http://127.0.0.1:3100/api/health/ready >/dev/null
mark appReady
inner logs worker 2>&1 | grep -q mqtt.subscribed
test "$(inner inspect -f '{{.State.Running}}' worker)" = true
mark mqttWorkerReady
current_step='run restore verifier'
DATABASE_URL=postgresql://meterwerk:ci-only-recovery-password@127.0.0.1:5544/meterwerk_restore_host_loss \
PGDATABASE=meterwerk_restore_host_loss METERWERK_BACKUP_MANIFEST="$backup.manifest.json" \
METERWERK_RESTORE_READY_URL=http://127.0.0.1:3100/api/health/ready \
  pnpm exec tsx scripts/restore-verifier.ts > "$RUNNER_TEMP/offsite-host-verifier.json"
mark restoreVerifierPassed
mark end
current_step='write host-loss evidence'
node --input-type=module - "$stage/times" <<'NODE'
import {readFileSync, writeFileSync} from 'node:fs';
const marks = Object.fromEntries(readFileSync(process.argv[2], 'utf8').trim().split('\n').map(line => { const [key,value] = line.split(' '); return [key,Number(value)]; }));
writeFileSync(process.env.RUNNER_TEMP + '/offsite-host-loss.json', JSON.stringify({status:'PASSED', sourceSha:process.env.GITHUB_SHA, scope:'synthetic empty Docker daemon; OS provisioning and external key-store recovery excluded', startedAt:new Date(marks.start).toISOString(), endedAt:new Date(marks.end).toISOString(), durationSeconds:(marks.end-marks.start)/1000, marks, emptyTargetVerified:true, imagesLoaded:true, offsiteOnlyRestore:true, databaseVerified:true, appReady:true, mqttWorkerSubscribed:true}, null, 2) + '\n');
NODE
