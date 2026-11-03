#!/usr/bin/env bash
set -euo pipefail

# Disposable synthetic-only PostgreSQL PITR drill. No external DB/credentials.
command -v docker >/dev/null || { echo "INFRASTRUCTURE_FAILURE: docker unavailable" >&2; exit 3; }
command -v node >/dev/null || { echo "INFRASTRUCTURE_FAILURE: node unavailable" >&2; exit 3; }
docker info >/dev/null 2>&1 || { echo "INFRASTRUCTURE_FAILURE: Docker unavailable" >&2; exit 3; }
image=postgres:17-alpine
docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image" >/dev/null || {
  echo "INFRASTRUCTURE_FAILURE: PostgreSQL image unavailable" >&2; exit 3;
}
evidence="${METERWERK_PITR_EVIDENCE_DIR:-${RUNNER_TEMP:-/tmp}/meterwerk-pitr-evidence}"
mkdir -p "$evidence"
export METERWERK_PITR_EVIDENCE_DIR="$evidence"
work="$(mktemp -d /tmp/meterwerk-pitr.XXXXXX)"
source="meterwerk-pitr-source-$$"
restored="meterwerk-pitr-restored-$$"
missing="meterwerk-pitr-missing-wal-$$"
mkdir -p "$work/archive" "$work/base"
chmod 777 "$work/archive"
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    echo "PITR drill failed; synthetic source and restore logs follow" >&2
    docker logs "$source" >&2 || true
    docker logs "$missing" >&2 || true
    docker logs "$restored" >&2 || true
  fi
  docker rm -f "$restored" "$missing" "$source" >/dev/null 2>&1 || true
  case "$work" in
    /tmp/meterwerk-pitr.*) sudo rm -rf -- "$work" ;;
    *) echo "Refusing to remove unexpected PITR temp path" >&2; return 1 ;;
  esac
  return "$result"
}
trap cleanup EXIT
trap 'echo "UNEXPECTED_FAILURE: drill command failed at line $LINENO" >&2' ERR

docker run -d --name "$source" --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$work/archive:/archive" postgres:17-alpine \
  -c wal_level=replica -c archive_mode=on -c archive_timeout=0 \
  -c "archive_command=test ! -f /archive/%f && cp %p /archive/%f" >/dev/null || {
    echo "INFRASTRUCTURE_FAILURE: source container did not start" >&2; exit 3;
  }
for attempt in $(seq 1 60); do
  if docker exec "$source" pg_isready -U postgres -d postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$source" pg_isready -U postgres -d postgres >/dev/null
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE phase3_pitr_probe (marker text PRIMARY KEY); INSERT INTO phase3_pitr_probe VALUES ('baseline');" >/dev/null
docker exec "$source" psql -U postgres -d postgres -Atqc "SELECT pg_switch_wal()" >/dev/null
docker exec "$source" pg_basebackup -D /tmp/phase3-base -U postgres -X stream --checkpoint=fast >/dev/null
# Select a fresh post-base segment: it cannot be satisfied from bundled base WAL.
docker exec "$source" psql -U postgres -d postgres -Atqc "SELECT pg_switch_wal()" >/dev/null
expected_segment="$(docker exec "$source" psql -U postgres -d postgres -Atqc 'SELECT pg_walfile_name(pg_current_wal_insert_lsn())')"
[[ "$expected_segment" =~ ^[0-9A-F]{24}$ ]]
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "INSERT INTO phase3_pitr_probe VALUES ('target-marker');" >/dev/null
target="$(docker exec "$source" psql -U postgres -d postgres -Atqc \
  "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'")"
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "INSERT INTO phase3_pitr_probe VALUES ('simulated-error'); SELECT pg_switch_wal();" >/dev/null
sleep 2
docker cp "$source:/tmp/phase3-base/." "$work/base/" >/dev/null
for attempt in $(seq 1 30); do
  if [ -s "$work/archive/$expected_segment" ]; then break; fi
  sleep 1
done
test -s "$work/archive/$expected_segment"
test ! -e "$work/base/pg_wal/$expected_segment"
# Validate the untouched backup before recovery configuration or deliberate damage.
docker run --rm --network none -v "$work/base:/data:ro" \
  --entrypoint pg_verifybackup "$image" /data > "$work/valid-base.log" 2>&1
cp -a "$work/base" "$work/base-incomplete"
node --input-type=module - "$work/base/backup_manifest" <<'NODE'
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!manifest.Files.some(file => file.Path === 'global/pg_control')) process.exit(1);
NODE
rm "$work/base-incomplete/global/pg_control"
test ! -e "$work/base-incomplete/global/pg_control"
verify_code=0
docker run --rm --network none -v "$work/base-incomplete:/data:ro" \
  --entrypoint sh "$image" -c \
  'command -v pg_verifybackup >/dev/null || exit 127; echo METERWERK_VERIFYBACKUP_EXECUTED; exec pg_verifybackup /data' \
  > "$work/incomplete-base.log" 2>&1 || verify_code=$?
node --input-type=module - "$work/incomplete-base.log" "$verify_code" "$work/base-input.json" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const [log, code, output] = process.argv.slice(2);
const verifierLog = readFileSync(log, 'utf8');
writeFileSync(output, JSON.stringify({ infrastructureOk: ![125,126,127,137].includes(Number(code)),
  verifierExecuted: verifierLog.includes('METERWERK_VERIFYBACKUP_EXECUTED'),
  validBackupExitCode: 0, manifestContainsFile: true, removedFile: 'global/pg_control',
  exitCode: Number(code), verifierLog: verifierLog.slice(-12000) }));
NODE
node scripts/recovery-negative-result.mjs incomplete-base "$work/base-input.json" "$evidence/incomplete-base.json"
touch "$work/base/recovery.signal"
printf "restore_command = 'cp /archive/%%f %%p'\nrecovery_target_time = '%s'\nrecovery_target_action = 'promote'\n" \
  "$target" >> "$work/base/postgresql.auto.conf"

cp -a "$work/base" "$work/base-missing-wal"
mkdir "$work/archive-missing-wal"
# WAL is owned by the container's PostgreSQL UID with mode 0600. Copy within
# an isolated root helper, preserving ownership; never relax archive permissions.
docker run --rm --user 0 --network none \
  -v "$work/archive:/archive:ro" -v "$work/archive-missing-wal:/copy" \
  --entrypoint sh "$image" -c 'cp -a /archive/. /copy/ && rm "/copy/$1"' sh "$expected_segment" || {
    echo "INFRASTRUCTURE_FAILURE: isolated WAL fixture preparation failed" >&2; exit 3;
  }
mkdir "$work/restore-evidence"
chmod 777 "$work/restore-evidence"
touch "$work/restore-evidence/restore.log"
chmod 666 "$work/restore-evidence/restore.log"
cat > "$work/restore-wal.sh" <<'RESTORE'
#!/bin/sh
segment="$1"
destination="$2"
record() { printf '%s\n' "$1" >> /evidence/restore.log; printf '%s\n' "$1" >&2; }
record "METERWERK_WAL_REQUEST=$segment"
if [ "$segment" = "$METERWERK_DENIED_SEGMENT" ]; then
  record "METERWERK_EXPECTED_MISSING_WAL=$segment"
  exit 1
fi
if [ -f "/archive/$segment" ]; then
  cp "/archive/$segment" "$destination" && exit 0
  record "METERWERK_RESTORE_INFRASTRUCTURE_FAILURE=$segment"
  exit 2
fi
case "$segment" in
  *.history) exit 1 ;;
  *) record "METERWERK_UNEXPECTED_MISSING_WAL=$segment"; exit 1 ;;
esac
RESTORE
printf "restore_command = 'sh /restore-wal.sh %%f %%p'\n" >> "$work/base-missing-wal/postgresql.auto.conf"
# Finish host-side configuration before handing ownership to PostgreSQL.
docker run --rm --user 0 --network none \
  -v "$work/base-missing-wal:/data" --entrypoint chown postgres:17-alpine \
  -R 999:999 /data
docker run -d --name "$missing" --network none \
  -e "METERWERK_DENIED_SEGMENT=$expected_segment" \
  -v "$work/base-missing-wal:/var/lib/postgresql/data" \
  -v "$work/archive-missing-wal:/archive:ro" \
  -v "$work/restore-wal.sh:/restore-wal.sh:ro" \
  -v "$work/restore-evidence:/evidence" postgres:17-alpine >/dev/null || {
    echo "INFRASTRUCTURE_FAILURE: missing-WAL container did not start" >&2; exit 3;
  }
for attempt in $(seq 1 30); do
  running="$(docker inspect -f '{{.State.Running}}' "$missing")"
  if [ "$running" != "true" ]; then break; fi
  sleep 1
done
running="$(docker inspect -f '{{.State.Running}}' "$missing")"
recovery=stopped
if [ "$running" = "true" ]; then
  in_recovery="$(docker exec "$missing" psql -U postgres -d postgres -Atqc \
    'SELECT pg_is_in_recovery()' 2>/dev/null || echo unknown)"
  case "$in_recovery" in
    t) recovery=in_recovery ;;
    f) recovery=promoted ;;
    *) recovery=unknown ;;
  esac
fi
docker inspect -f '{{json .State}}' "$missing" > "$work/missing-state.json"
docker logs "$missing" > "$work/missing-postgres.log" 2>&1
node --input-type=module - "$work" "$expected_segment" "$recovery" <<'NODE'
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [work, expectedSegment, recovery] = process.argv.slice(2);
const state = JSON.parse(readFileSync(`${work}/missing-state.json`, 'utf8'));
const restorePath = `${work}/restore-evidence/restore.log`;
writeFileSync(`${work}/wal-input.json`, JSON.stringify({ expectedSegment, recovery,
  infrastructureOk: true, running: state.Running, exitCode: state.ExitCode,
  oomKilled: state.OOMKilled, containerError: state.Error,
  restoreLog: existsSync(restorePath) ? readFileSync(restorePath, 'utf8').slice(-12000) : '',
  postgresLog: readFileSync(`${work}/missing-postgres.log`, 'utf8').slice(-12000) }));
NODE
node scripts/recovery-negative-result.mjs missing-wal "$work/wal-input.json" "$evidence/missing-wal.json"
docker rm -f "$missing" >/dev/null

docker run -d --name "$restored" --network none \
  -v "$work/base:/var/lib/postgresql/data" -v "$work/archive:/archive:ro" \
  postgres:17-alpine >/dev/null
for attempt in $(seq 1 60); do
  if docker exec "$restored" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    in_recovery="$(docker exec "$restored" psql -U postgres -d postgres -Atqc \
      'SELECT pg_is_in_recovery()' 2>/dev/null || echo unknown)"
    if [ "$in_recovery" = "f" ]; then break; fi
  fi
  sleep 1
done
docker exec "$restored" pg_isready -U postgres -d postgres >/dev/null
test "$(docker exec "$restored" psql -U postgres -d postgres -Atqc \
  'SELECT pg_is_in_recovery()')" = "f"
baseline="$(docker exec "$restored" psql -U postgres -d postgres -Atqc \
  "SELECT count(*) FROM phase3_pitr_probe WHERE marker='baseline'")"
error_rows="$(docker exec "$restored" psql -U postgres -d postgres -Atqc \
  "SELECT count(*) FROM phase3_pitr_probe WHERE marker='simulated-error'")"
test "$baseline" = "1"
test "$error_rows" = "0"
test "$(docker exec "$restored" psql -U postgres -d postgres -Atqc \
  "SELECT count(*) FROM phase3_pitr_probe WHERE marker='target-marker'")" = "1"
echo "PITR synthetic drill PASSED: baseline restored, post-target error absent, target=$target"
