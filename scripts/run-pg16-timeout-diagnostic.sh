#!/usr/bin/env bash
set -euo pipefail

source_dir=${1:?PostgreSQL 16.15 source directory required}
prefix=${2:?temporary install prefix required}
work=${RUNNER_TEMP:?RUNNER_TEMP is required}/pg16-timeout-diagnostic
evidence=${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}/artifacts/pg16-timeout-diagnostic
db="$work/data"
mkdir -p "$work" "$evidence" "$work/archive"
export PATH="$prefix/bin:$PATH" PGHOST="$work/socket" PGPORT=55441 PGUSER="$(id -un)" PGDATABASE=postgres
mkdir "$PGHOST"

cleanup() {
  result=$?
  trap - EXIT
  pg_ctl -D "$db" -m immediate stop >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup EXIT

initdb -D "$db" --auth-local=trust --auth-host=reject > "$evidence/initdb.log" 2>&1
cat >> "$db/postgresql.conf" <<EOF
listen_addresses = ''
unix_socket_directories = '$PGHOST'
port = 55441
wal_level = replica
archive_mode = on
archive_timeout = 60
archive_command = 'test ! -f $work/archive/%f && cp %p $work/archive/%f'
log_min_messages = log
log_line_prefix = '%m [%p] '
EOF
pg_ctl -D "$db" -l "$evidence/postgres.log" start > "$evidence/start.log" 2>&1

psql -X -v ON_ERROR_STOP=1 -c \
  'CREATE TABLE timeout_probe(id bigint PRIMARY KEY, payload text NOT NULL) WITH (autovacuum_enabled=false)'
psql -X -v ON_ERROR_STOP=1 -c \
  "INSERT INTO timeout_probe VALUES (1, repeat('a', 128))"

psql -XAtq -v ON_ERROR_STOP=1 -c "SELECT json_build_object(
  'serverVersion',current_setting('server_version'),
  'postmasterStartTime',extract(epoch from pg_postmaster_start_time())*1000,
  'sampledAt',extract(epoch from clock_timestamp())*1000,
  'archiveTimeout',current_setting('archive_timeout'),
  'archiveTimeoutSource',(SELECT source FROM pg_settings WHERE name='archive_timeout'),
  'archiveMode',current_setting('archive_mode'),
  'walLevel',current_setting('wal_level'),
  'archiveCommandConfigured',(current_setting('archive_command')<>''),
  'archiveLibrary',coalesce(current_setting('archive_library',true),''),
  'inRecovery',pg_is_in_recovery(),
  'checkpointerPid',(SELECT pid FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
  'checkpointerStartTime',(SELECT extract(epoch from backend_start)*1000 FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
  'checkpointerWaitEvent',(SELECT wait_event FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
  't0Lsn',pg_current_wal_lsn()::text,
  't0InsertLsn',pg_current_wal_insert_lsn()::text,
  't0Offset',(pg_walfile_name_offset(pg_current_wal_lsn())).file_offset,
  't0Segment',pg_walfile_name(pg_current_wal_lsn()),
  'walStats',(SELECT to_json(w) FROM pg_stat_wal w),
  'archiverStats',(SELECT to_json(a) FROM pg_stat_archiver a)
)" > "$evidence/t0.json"

start_lsn=$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).t0Lsn)' "$evidence/t0.json")
printf 'sampled_at_utc,transaction_id,lsn,insert_lsn,segment\n' > "$evidence/activity.csv"

# Run four full timeout intervals after server/checkpointer start. Committed
# logged INSERT/UPDATE pairs every five seconds keep important WAL activity
# continuous without approaching the 16 MiB segment size.
for txid in $(seq 1 48); do
  psql -Xq -v ON_ERROR_STOP=1 -c \
    "INSERT INTO timeout_probe VALUES ($((txid + 1)), repeat('b', 128))"
  psql -Xq -v ON_ERROR_STOP=1 -c \
    "UPDATE timeout_probe SET payload=repeat('c', 128) WHERE id=1"
  psql -XAtF ',' -v ON_ERROR_STOP=1 -c \
    "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),$txid,pg_current_wal_lsn(),pg_current_wal_insert_lsn(),pg_walfile_name(pg_current_wal_lsn())" \
    >> "$evidence/activity.csv"
  sleep 5
done

psql -XAtq -v ON_ERROR_STOP=1 -c "SELECT json_build_object(
  'sampledAt',extract(epoch from clock_timestamp())*1000,
  'postmasterStartTime',extract(epoch from pg_postmaster_start_time())*1000,
  'currentLsn',pg_current_wal_lsn()::text,
  'currentInsertLsn',pg_current_wal_insert_lsn()::text,
  'currentOffset',(pg_walfile_name_offset(pg_current_wal_lsn())).file_offset,
  'currentSegment',pg_walfile_name(pg_current_wal_lsn()),
  'walStats',(SELECT to_json(w) FROM pg_stat_wal w),
  'archiverStats',(SELECT to_json(a) FROM pg_stat_archiver a),
  'checkpointerPid',(SELECT pid FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
  'checkpointerStartTime',(SELECT extract(epoch from backend_start)*1000 FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
  'checkpointerWaitEvent',(SELECT wait_event FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
  'checkpointerWaitEventType',(SELECT wait_event_type FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
  'inRecovery',pg_is_in_recovery()
)" > "$evidence/final-state.json"

end_lsn=$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).currentLsn)' "$evidence/final-state.json")
pg_waldump --path="$db/pg_wal" --start="$start_lsn" --end="$end_lsn" \
  > "$evidence/waldump.txt" 2> "$evidence/waldump.stderr"
grep -Eq 'rmgr: Heap' "$evidence/waldump.txt"
grep -Eq 'rmgr: Transaction.*COMMIT|COMMIT' "$evidence/waldump.txt"
grep -c 'PG16_TIMEOUT_DIAG phase=COMPARISON' "$evidence/postgres.log" > "$evidence/comparison-count.txt"
[[ "$(cat "$evidence/comparison-count.txt")" -ge 3 ]]
grep 'PG16_TIMEOUT_DIAG' "$evidence/postgres.log" > "$evidence/timeout-diagnostics.log"

node - "$evidence/t0.json" "$evidence/final-state.json" "$evidence/summary.json" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const [t0Path, finalPath, outputPath] = process.argv.slice(2);
const t0 = JSON.parse(readFileSync(t0Path, "utf8"));
const final = JSON.parse(readFileSync(finalPath, "utf8"));
if (!t0.serverVersion.startsWith("16.15") || t0.archiveTimeout !== "1min" ||
    t0.archiveTimeoutSource !== "configuration file" || t0.archiveMode !== "on" ||
    t0.walLevel !== "replica" || !t0.archiveCommandConfigured ||
    t0.archiveLibrary !== "" || t0.inRecovery || !t0.checkpointerPid ||
    !t0.checkpointerStartTime || !final.checkpointerPid || final.inRecovery)
  throw new Error("PG16_DIAGNOSTIC_RUNTIME_INVALID");
writeFileSync(outputPath, JSON.stringify({
  status: "DIAGNOSTIC_CAPTURED",
  source: "PostgreSQL REL_16_15 with temporary LOG instrumentation; disposable runner only",
  serverVersion: t0.serverVersion,
  postmasterStartTime: t0.postmasterStartTime,
  checkpointerPid: t0.checkpointerPid,
  checkpointerStartTime: t0.checkpointerStartTime,
  initial: t0,
  final,
  noForcedSwitch: true,
  noForcedCheckpoint: true,
  periodicTransactionBatches: 48,
  loggedInsertUpdateTransactions: 96,
  timeoutComparisons: Number(readFileSync(outputPath.replace("summary.json", "comparison-count.txt"), "utf8")),
  segmentChanged: t0.t0Segment !== final.currentSegment,
  t0Offset: t0.t0Offset,
  finalOffset: final.currentOffset,
  workloadFilledSegment: final.currentOffset >= 16777216,
}, null, 2) + "\n");
NODE

printf 'PG16_TIMEOUT_DIAGNOSTIC_CAPTURED\n'
