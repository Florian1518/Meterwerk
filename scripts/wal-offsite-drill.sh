#!/usr/bin/env bash
set -euo pipefail
# Runner-owned synthetic PostgreSQL. No Docker/AppArmor or existing database changes.
work=$(mktemp -d "$RUNNER_TEMP/meterwerk-wal.XXXXXX")
export PGHOST="$work" PGPORT=55439 PGUSER="$(id -un)" PGDATABASE=postgres
export METERWERK_ENV=test
mkdir "$work/archive" "$work/evidence"
worker=''
cleanup() {
  if [[ -n "$worker" ]]; then kill "$worker" 2>/dev/null || true; wait "$worker" 2>/dev/null || true; fi
  pg_ctl -D "$work/db" -m immediate stop >/dev/null 2>&1 || true
}
trap cleanup EXIT
initdb -D "$work/db" --auth-local=trust --auth-host=reject >/dev/null
cat >> "$work/db/postgresql.conf" <<EOF
listen_addresses = ''
unix_socket_directories = '$work'
port = 55439
archive_mode = on
archive_timeout = 60
archive_command = 'test ! -f $work/archive/%f && cp %p $work/archive/%f'
EOF
pg_ctl -D "$work/db" -l "$work/postgres.log" start >/dev/null
age-keygen -o "$work/identity" 2>/dev/null
export METERWERK_BACKUP_AGE_IDENTITY_FILE="$work/identity"
export METERWERK_BACKUP_AGE_RECIPIENT
METERWERK_BACKUP_AGE_RECIPIENT=$(age-keygen -y "$work/identity")
first=$(psql -XAt -v ON_ERROR_STOP=1 -c 'SELECT pg_walfile_name(pg_current_wal_lsn())')
export WAL_DRILL_WORK="$work" WAL_DRILL_FIRST="$first"
node --input-type=module -e 'import {writeFileSync} from "node:fs"; writeFileSync(process.env.WAL_DRILL_WORK+"/plan.json",JSON.stringify({first:process.env.WAL_DRILL_FIRST,segmentSize:16777216,failedCountBefore:0,maxAgeMs:120000,pollMs:2000,archiveDirectory:process.env.WAL_DRILL_WORK+"/archive"}));'
start=$(date +%s)
# One persistent worker observes three successive archive/upload cycles.
for cycle in 1 2 3; do
  psql -XAt -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS wal_probe(n integer); INSERT INTO wal_probe VALUES (1); SELECT pg_switch_wal();' >/dev/null
  expected=$(psql -XAt -v ON_ERROR_STOP=1 -c "SELECT pg_walfile_name(pg_current_wal_lsn() - mod(pg_current_wal_lsn() - '0/0'::pg_lsn,16777216) - 1)")
  confirmed=false
  for attempt in $(seq 1 60); do
    archived=$(psql -XAt -v ON_ERROR_STOP=1 -c 'SELECT last_archived_wal FROM pg_stat_archiver')
    if [[ "$archived" == "$expected" ]]; then confirmed=true; break; fi
    sleep 1
  done
  [[ "$confirmed" == true ]] || { echo ARCHIVE_TIMEOUT >&2; exit 1; }
  if [[ -z "$worker" ]]; then
    node scripts/wal-offsite.mjs "$work/plan.json" "$work/evidence/state.json" &
    worker=$!
  fi
  export WAL_DRILL_EXPECTED="$expected"
  uploaded=false
  for attempt in $(seq 1 90); do
    kill -0 "$worker" || { echo WAL_WORKER_EXITED >&2; exit 1; }
    if node --input-type=module -e 'import {readFileSync} from "node:fs"; try { const s=JSON.parse(readFileSync(process.env.WAL_DRILL_WORK+"/evidence/state.json")); process.exit(s.status==="PASSED"&&s.lastArchivedWal===process.env.WAL_DRILL_EXPECTED?0:1); } catch { process.exit(1); }'; then uploaded=true; break; fi
    sleep 1
  done
  [[ "$uploaded" == true ]] || { echo UPLOAD_TIMEOUT >&2; exit 1; }
  node scripts/wal-offsite.mjs check "$work/evidence/state.json" 120000
  cp "$work/evidence/state.json" "$work/evidence/cycle-$cycle.json"
done
# Prove the configured cadence without a manual WAL switch: a new synthetic
# commit must be archived by archive_timeout, then shipped by the same worker.
wal_timeout_result=$(psql -XAtq -F '|' -v ON_ERROR_STOP=1 -c "INSERT INTO wal_probe VALUES (4); SELECT (extract(epoch from clock_timestamp())*1000)::bigint, pg_walfile_name(pg_current_wal_lsn() - 1)")
IFS='|' read -r wal_timeout_start wal_timeout_segment <<< "$wal_timeout_result"
[[ "$wal_timeout_segment" =~ ^[0-9A-F]{24}$ ]] || { echo INVALID_TIMEOUT_WAL >&2; exit 1; }
export WAL_DRILL_TIMEOUT_START="$wal_timeout_start" WAL_DRILL_TIMEOUT_WAL="$wal_timeout_segment"
timed_out=false
for attempt in $(seq 1 100); do
  kill -0 "$worker" || { echo WAL_WORKER_EXITED >&2; exit 1; }
  archived=$(psql -XAt -v ON_ERROR_STOP=1 -c 'SELECT last_archived_wal FROM pg_stat_archiver')
  if [[ "$archived" == "$wal_timeout_segment" ]]; then timed_out=true; break; fi
  sleep 1
done
[[ "$timed_out" == true ]] || { echo ARCHIVE_TIMEOUT_NOT_AUTOMATIC >&2; exit 1; }
node --input-type=module -e 'import {readFileSync} from "node:fs"; const s=JSON.parse(readFileSync(process.env.WAL_DRILL_WORK+"/evidence/state.json")); if(s.status!=="PASSED"||s.lastArchivedWal!==process.env.WAL_DRILL_TIMEOUT_WAL) process.exit(1);'
node scripts/wal-offsite.mjs check "$work/evidence/state.json" 120000
cp "$work/evidence/state.json" "$work/evidence/cycle-4.json"
export WAL_DRILL_SECONDS=$(( $(date +%s) - start ))
node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs"; const p=process.env.WAL_DRILL_WORK+"/evidence/"; const cycles=[1,2,3,4].map(n=>JSON.parse(readFileSync(p+"cycle-"+n+".json"))); if(cycles.some(c=>c.status!=="PASSED") || cycles.some((c,i)=>c.expectedSegments!==i+1) || cycles[3].lastArchivedWal!==process.env.WAL_DRILL_TIMEOUT_WAL) process.exit(1); const archiveConfirmedAt=cycles[3].lastArchiveAt, uploadVerifiedAt=cycles[3].lastVerifiedUploadAt, writeCommittedAt=Number(process.env.WAL_DRILL_TIMEOUT_START); if(!(writeCommittedAt<=archiveConfirmedAt&&archiveConfirmedAt<=uploadVerifiedAt)) process.exit(1); writeFileSync(p+"summary.json",JSON.stringify({status:"PASSED",scope:"three synthetic incremental WAL uploads plus one naturally timed archive_timeout cycle; not operational RPO/RTO",sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,event:process.env.GITHUB_EVENT_NAME,durationSeconds:Number(process.env.WAL_DRILL_SECONDS),configuredArchiveTimeoutSeconds:60,manualSwitchForTimedCycle:false,timedCycle:{wal:process.env.WAL_DRILL_TIMEOUT_WAL,writeCommittedAt,archiveConfirmedAt,uploadVerifiedAt,writeToOffsiteSeconds:(uploadVerifiedAt-writeCommittedAt)/1000,commitToArchiveSeconds:(archiveConfirmedAt-writeCommittedAt)/1000,archiveToUploadSeconds:(uploadVerifiedAt-archiveConfirmedAt)/1000},cycles:cycles.map(c=>({segments:c.expectedSegments,lastArchivedWal:c.lastArchivedWal,lastArchiveAt:c.lastArchiveAt,lastVerifiedUploadAt:c.lastVerifiedUploadAt}))},null,2)+"\n");'
mkdir -p artifacts/wal-offsite
cp "$work/evidence/"*.json artifacts/wal-offsite/
# Retain every offsite object. Ephemeral identity never becomes an artifact.
