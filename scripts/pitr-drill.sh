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
  -c track_commit_timestamp=on \
  -c "archive_command=test ! -f /archive/%f && cp %p /archive/%f" >/dev/null || {
    echo "INFRASTRUCTURE_FAILURE: source container did not start" >&2; exit 3;
  }
# The image starts a temporary socket-only server during initdb and stops it
# before launching the final server. Only container-local TCP proves that
# initialization has finished; socket readiness can race that shutdown.
for attempt in $(seq 1 60); do
  if docker exec "$source" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$source" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE phase3_pitr_probe (marker text PRIMARY KEY); INSERT INTO phase3_pitr_probe VALUES ('baseline');" >/dev/null
docker exec "$source" psql -U postgres -d postgres -Atqc "SELECT pg_switch_wal()" >/dev/null
docker exec "$source" pg_basebackup -D /tmp/phase3-base -U postgres -X stream --checkpoint=fast >/dev/null
# Select a fresh post-base segment: it cannot be satisfied from bundled base WAL.
docker exec "$source" psql -U postgres -d postgres -Atqc "SELECT pg_switch_wal()" >/dev/null
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "INSERT INTO phase3_pitr_probe VALUES ('target-marker');" >/dev/null
# The successful psql exit above establishes COMMIT before any LSN observation.
# PostgreSQL records the actual transaction commit timestamp; the LSN is
# observed in the subsequent call after successful synchronous COMMIT.
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atqc \
  "SELECT json_build_object('commitTimestamp',(SELECT pg_xact_commit_timestamp(xmin) FROM phase3_pitr_probe WHERE marker='target-marker'),'commitLsn',pg_current_wal_lsn(),'commitWalSegment',pg_walfile_name(pg_current_wal_lsn()),'segmentBytes',pg_size_bytes(current_setting('wal_segment_size')),'failedCountBefore',failed_count,'archivedCountBefore',archived_count) FROM pg_stat_archiver" \
  > "$work/commit.json"
expected_segment="$(node --input-type=module -e 'import { readFileSync } from "node:fs"; console.log(JSON.parse(readFileSync(process.argv[1], "utf8")).commitWalSegment)' "$work/commit.json")"
[[ "$expected_segment" =~ ^[0-9A-F]{24}$ ]]
# A named WAL restore point is ordered after the desired commit and before the
# error transaction. Record its exact LSN; no wall-clock sleeps define the target.
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atqc \
  "SELECT pg_create_restore_point('meterwerk_before_error')" > "$work/target-lsn"
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "INSERT INTO phase3_pitr_probe VALUES ('simulated-error');" >/dev/null
docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atqc \
  "SELECT json_build_object('postErrorLsn',pg_current_wal_lsn(),'postErrorWalSegment',pg_walfile_name(pg_current_wal_lsn()))" > "$work/post-error.json"
# Separate successful COMMIT, observation, and switch calls are mandatory.
if ! docker exec "$source" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atqc \
  "SELECT pg_switch_wal()" > "$work/switch-lsn"; then
  echo "WAL_SWITCH_FAILURE: post-commit WAL switch failed" >&2
  exit 1
fi
docker cp "$source:/tmp/phase3-base/." "$work/base/" >/dev/null
node scripts/pitr-archive.mjs archive "$source" "$work" "$evidence"
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
printf "restore_command = 'cp /archive/%%f %%p'\nrecovery_target_name = 'meterwerk_before_error'\nrecovery_target_action = 'promote'\n" \
  >> "$work/base/postgresql.auto.conf"

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
  test "$(docker inspect -f '{{.State.Running}}' "$restored")" = "true" || {
    echo "TARGET_NOT_REACHED: positive recovery exited" >&2; exit 1;
  }
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
# Check relation readability and validated constraints in this synthetic probe.
# The full application restore verifier/readiness remains a separate mandatory
# workflow gate against the restored application database, not this probe DB.
docker exec "$restored" pg_dump -U postgres -d postgres -Fc -f /tmp/pitr-verified.dump
docker exec "$restored" pg_restore --list /tmp/pitr-verified.dump >/dev/null
docker exec "$restored" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atqc \
  "SELECT json_build_object('inRecovery',pg_is_in_recovery(),'replayLsn',pg_last_wal_replay_lsn(),'baselineCount',(SELECT count(*) FROM phase3_pitr_probe WHERE marker='baseline'),'preErrorCount',(SELECT count(*) FROM phase3_pitr_probe WHERE marker='target-marker'),'postTargetErrorCount',(SELECT count(*) FROM phase3_pitr_probe WHERE marker='simulated-error'),'constraintsValid',NOT EXISTS(SELECT 1 FROM pg_constraint WHERE NOT convalidated))" > "$work/positive.json"
node scripts/pitr-archive.mjs verify "$restored" "$work" "$evidence"
