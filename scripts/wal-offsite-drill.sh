#!/usr/bin/env bash
set -euo pipefail
# Fresh runner-owned PostgreSQL 16. The positive path contains no WAL switch
# or checkpoint call; low-volume commits keep the server active for the timer.
work=$(mktemp -d "$RUNNER_TEMP/meterwerk-wal-natural.XXXXXX")
export PGHOST="$work" PGPORT=55439 PGUSER="$(id -un)" PGDATABASE=postgres
export METERWERK_ENV=test
mkdir "$work/archive" "$work/evidence"
worker=''
cleanup() {
  result=$?
  trap - EXIT
  if [[ -n "$worker" ]]; then kill "$worker" 2>/dev/null || true; wait "$worker" 2>/dev/null || true; fi
  pg_ctl -D "$work/db" -m immediate stop >/dev/null 2>&1 || true
  if [[ -d "$work/evidence" ]]; then
    mkdir -p artifacts/wal-offsite
    cp "$work/evidence/"*.json artifacts/wal-offsite/ 2>/dev/null || true
  fi
  if [[ -f "$work/postgres.log" ]]; then cp "$work/postgres.log" artifacts/wal-offsite/postgres.log; fi
  exit "$result"
}
trap cleanup EXIT

initdb -D "$work/db" --auth-local=trust --auth-host=reject >/dev/null
cat >> "$work/db/postgresql.conf" <<EOF
listen_addresses = ''
unix_socket_directories = '$work'
port = 55439
wal_level = replica
archive_mode = on
archive_timeout = 60
log_min_messages = debug1
archive_command = 'test ! -f $work/archive/%f && cp %p $work/archive/%f'
EOF
pg_ctl -D "$work/db" -l "$work/postgres.log" start >/dev/null

# pg_walfile_name reports the preceding file at an exact segment boundary.
# For the current write position, inspect the next byte (read-only arithmetic).
# Verify the stock SQL semantics at and immediately before the 16 MiB boundary.
boundary_ok=$(psql -XAtq -v ON_ERROR_STOP=1 -c "SELECT
  right(pg_walfile_name('0/2000000'::pg_lsn + 1),16)='0000000000000002' AND
  right(pg_walfile_name('0/1FFFFF0'::pg_lsn + 1),16)='0000000000000001'")
[[ "$boundary_ok" == t ]] || { echo WAL_BOUNDARY_MAPPING_INVALID >&2; exit 1; }

psql -X -v ON_ERROR_STOP=1 \
  -c 'SHOW server_version; SHOW wal_level; SHOW archive_mode; SHOW archive_command; SHOW archive_library; SHOW archive_timeout;' \
  | tee "$work/evidence/runtime-settings.txt"
psql -Xq -v ON_ERROR_STOP=1 -c \
  'CREATE TABLE wal_probe(n bigint NOT NULL, touched_at timestamptz NOT NULL)'

settings=$(psql -XAtq -v ON_ERROR_STOP=1 -c "SELECT json_build_object(
  'serverVersion',current_setting('server_version'),
  'serverVersionNum',current_setting('server_version_num')::int,
  'postmasterStartTime',extract(epoch from pg_postmaster_start_time())*1000,
  'walLevel',current_setting('wal_level'),
  'archiveMode',current_setting('archive_mode'),
  'archiveCommand',current_setting('archive_command'),
  'archiveLibrary',coalesce(current_setting('archive_library',true),''),
  'archiveTimeout',current_setting('archive_timeout'),
  'archiveTimeoutSeconds',extract(epoch from current_setting('archive_timeout')::interval),
  'archiveTimeoutSource',(SELECT source FROM pg_settings WHERE name='archive_timeout'),
  'archiveTimeoutPendingRestart',(SELECT pending_restart FROM pg_settings WHERE name='archive_timeout'),
  'archiverPid',(SELECT pid FROM pg_stat_activity WHERE backend_type='archiver' LIMIT 1),
  'checkpointerPid',(SELECT pid FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1))")
wal_segment_size=$(pg_controldata "$work/db" | awk -F': *' '/Bytes per WAL segment/ {print $2}')
[[ "$wal_segment_size" =~ ^[0-9]+$ ]] || { echo WAL_SEGMENT_SIZE_UNAVAILABLE >&2; exit 1; }
export WAL_DRILL_WORK="$work" WAL_DRILL_SETTINGS="$settings" WAL_DRILL_SEGMENT_SIZE="$wal_segment_size"
initial=$(psql -XAtq -v ON_ERROR_STOP=1 -c "SELECT json_build_object(
  'sampledAt',extract(epoch from clock_timestamp())*1000,
  'currentLsn',pg_current_wal_lsn()::text,
  'currentSegment',pg_walfile_name(pg_current_wal_lsn() + 1),
  'currentOffset',(pg_walfile_name_offset(pg_current_wal_lsn())).file_offset,
  'archivedCount',archived_count,'failedCount',failed_count,
  'lastArchivedWal',last_archived_wal,
  'lastArchivedAt',extract(epoch from last_archived_time)*1000,
  'lastFailedWal',last_failed_wal,
  'lastFailedAt',extract(epoch from last_failed_time)*1000,
  'archiverPid',(SELECT pid FROM pg_stat_activity WHERE backend_type='archiver' LIMIT 1),
  'checkpointerPid',(SELECT pid FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
  'timedCheckpoints',checkpoints_timed,
  'requestedCheckpoints',checkpoints_req,
  'walRecords',(SELECT wal_records FROM pg_stat_wal),
  'checkpointerWaitEvent',(SELECT wait_event FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
  'checkpointerWaitEventType',(SELECT wait_event_type FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
  'inRecovery',pg_is_in_recovery()
) FROM pg_stat_archiver CROSS JOIN pg_stat_bgwriter")
printf '%s\n' "$initial" > "$work/evidence/initial-state.json"
export WAL_DRILL_INITIAL="$initial"
node --input-type=module -e '
  import {writeFileSync} from "node:fs";
  const settings={...JSON.parse(process.env.WAL_DRILL_SETTINGS),walSegmentSize:Number(process.env.WAL_DRILL_SEGMENT_SIZE)};
  const initial=JSON.parse(process.env.WAL_DRILL_INITIAL);
  if (settings.serverVersionNum !== 160015 || settings.walLevel !== "replica" ||
      settings.archiveMode !== "on" || !settings.archiveCommand || settings.archiveLibrary !== "" ||
      settings.archiveTimeoutSeconds !== 60 || !Number.isInteger(settings.archiverPid) ||
      !Number.isInteger(settings.checkpointerPid) || settings.archiveTimeoutSource !== "configuration file" ||
      settings.archiveTimeoutPendingRestart !== false || initial.inRecovery !== false ||
      initial.archivedCount !== 0 || initial.failedCount !== 0 || !Number.isInteger(initial.archiverPid))
    throw new Error("RUNTIME_WAL_CONFIGURATION_INVALID");
  writeFileSync(process.env.WAL_DRILL_WORK+"/evidence/t0.json",JSON.stringify({
    referenceAt:initial.sampledAt,initialSegment:initial.currentSegment,
    initialLsn:initial.currentLsn,initialArchiver:initial
  },null,2)+"\n");
  writeFileSync(process.env.WAL_DRILL_WORK+"/evidence/settings.json",JSON.stringify(settings,null,2)+"\n");
  writeFileSync(process.env.WAL_DRILL_WORK+"/plan.json",JSON.stringify({
    first:initial.currentSegment,segmentSize:settings.walSegmentSize,
    failedCountBefore:0,maxAgeMs:120000,pollMs:1000,
    archiveDirectory:process.env.WAL_DRILL_WORK+"/archive"
  }));
'

age-keygen -o "$work/identity" 2>/dev/null
export METERWERK_BACKUP_AGE_IDENTITY_FILE="$work/identity"
export METERWERK_BACKUP_AGE_RECIPIENT
METERWERK_BACKUP_AGE_RECIPIENT=$(age-keygen -y "$work/identity")
start_reference=$(node --input-type=module -e 'process.stdout.write(String(JSON.parse(process.env.WAL_DRILL_INITIAL).sampledAt))')

sample() {
  psql -XAtq -v ON_ERROR_STOP=1 -c "SELECT json_build_object(
    'sampledAt',extract(epoch from clock_timestamp())*1000,
    'currentLsn',pg_current_wal_lsn()::text,
    'currentSegment',pg_walfile_name(pg_current_wal_lsn() + 1),
    'currentOffset',(pg_walfile_name_offset(pg_current_wal_lsn())).file_offset,
    'archivedCount',archived_count,'failedCount',failed_count,
    'lastArchivedWal',last_archived_wal,
    'lastArchivedAt',extract(epoch from last_archived_time)*1000,
    'lastFailedWal',last_failed_wal,
    'lastFailedAt',extract(epoch from last_failed_time)*1000,
    'archiverPid',(SELECT pid FROM pg_stat_activity WHERE backend_type='archiver' LIMIT 1),
    'checkpointerPid',(SELECT pid FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
    'timedCheckpoints',checkpoints_timed,
    'requestedCheckpoints',checkpoints_req,
    'walRecords',(SELECT wal_records FROM pg_stat_wal),
    'checkpointerWaitEvent',(SELECT wait_event FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
    'checkpointerWaitEventType',(SELECT wait_event_type FROM pg_stat_activity WHERE backend_type='checkpointer' LIMIT 1),
    'inRecovery',pg_is_in_recovery()
  ) FROM pg_stat_archiver CROSS JOIN pg_stat_bgwriter"
}

activity_sequence=0
previous_switch_observed_at="$start_reference"
for cycle in 1 2 3; do
  before=$(sample)
  export WAL_CYCLE_BEFORE="$before"
  expected=$(node --input-type=module -e 'process.stdout.write(JSON.parse(process.env.WAL_CYCLE_BEFORE).currentSegment)')
  baseline_count=$(node --input-type=module -e 'process.stdout.write(String(JSON.parse(process.env.WAL_CYCLE_BEFORE).archivedCount))')
  [[ "$expected" =~ ^[0-9A-F]{24}$ ]] || { echo INVALID_INITIAL_WAL_SEGMENT >&2; exit 1; }
  [[ "$baseline_count" -eq $((cycle-1)) ]] || { echo ARCHIVER_BASELINE_MISMATCH >&2; exit 1; }
  first_activity_at=''
  last_activity_at=''
  first_activity_segment=''
  transaction_count=0
  max_offset=0
  last_pre_switch_offset=0
  last_pre_switch_at=''
  switch_observed_at=''
  archive_sampled_at=''
  switched_segment=''
  uploaded=false

  # Capture startup's diagnosed 300 s sleep without excluding its RPO exposure.
  # Later cycles retain the 120-observation limit. Acceptance stays at 300 s.
  # A tiny committed INSERT every 10 s keeps genuine WAL activity without
  # approaching the 16 MiB segment boundary.
  observation_limit=120
  if [[ "$cycle" -eq 1 ]]; then observation_limit=360; fi
  for attempt in $(seq 1 "$observation_limit"); do
    if [[ -n "$worker" ]]; then kill -0 "$worker" || { echo WAL_WORKER_EXITED >&2; exit 1; }; fi
    if (( (attempt-1) % 10 == 0 )); then
      activity_sequence=$((activity_sequence+1))
      psql -Xq -v ON_ERROR_STOP=1 -c "INSERT INTO wal_probe VALUES ($activity_sequence,clock_timestamp())"
      activity=$(psql -XAt -v ON_ERROR_STOP=1 -c "SELECT extract(epoch from clock_timestamp())*1000,pg_walfile_name(pg_current_wal_lsn() + 1)")
      IFS='|' read -r activity_at activity_segment <<< "$activity"
      [[ -n "$first_activity_at" ]] || { first_activity_at="$activity_at"; first_activity_segment="$activity_segment"; }
      # A transaction committed after the natural switch belongs to the next
      # cycle, even if this poll has not yet observed the archived segment.
      if [[ "$activity_segment" == "$expected" ]]; then
        last_activity_at="$activity_at"
        transaction_count=$((transaction_count+1))
      fi
    fi

    current=$(sample)
    export WAL_CYCLE_SAMPLE="$current"
    readarray -t fields < <(node --input-type=module -e '
      const s=JSON.parse(process.env.WAL_CYCLE_SAMPLE);
      for (const k of ["sampledAt","currentSegment","currentOffset","archivedCount","failedCount","lastArchivedWal","lastArchivedAt","lastFailedWal","lastFailedAt","archiverPid"]) console.log(s[k]??"");
    ')
    sampled_at="${fields[0]}"
    current_segment="${fields[1]}"
    current_offset="${fields[2]}"
    archived_count="${fields[3]}"
    failed_count="${fields[4]}"
    last_archived_wal="${fields[5]}"
    last_archived_at="${fields[6]}"
    last_failed_wal="${fields[7]}"
    last_failed_at="${fields[8]}"
    archiver_pid="${fields[9]}"
    export WAL_CYCLE_PROGRESS="$current" WAL_CYCLE_EXPECTED="$expected" WAL_CYCLE_NUMBER="$cycle" \
      WAL_CYCLE_FIRST_ACTIVITY="$first_activity_at" WAL_CYCLE_LAST_ACTIVITY="$last_activity_at" \
      WAL_CYCLE_SWITCH_OBSERVED="$switch_observed_at" WAL_CYCLE_MAX_OFFSET_PROGRESS="$max_offset"
    node --input-type=module -e '
      import {writeFileSync} from "node:fs";
      writeFileSync(process.env.WAL_DRILL_WORK+"/evidence/progress.json",JSON.stringify({
        cycle:Number(process.env.WAL_CYCLE_NUMBER),expectedWal:process.env.WAL_CYCLE_EXPECTED,
        firstActivityAt:process.env.WAL_CYCLE_FIRST_ACTIVITY||null,lastActivityAt:process.env.WAL_CYCLE_LAST_ACTIVITY||null,
        naturalSwitchObservedAt:process.env.WAL_CYCLE_SWITCH_OBSERVED||null,
        maxObservedWalOffset:Number(process.env.WAL_CYCLE_MAX_OFFSET_PROGRESS),sample:JSON.parse(process.env.WAL_CYCLE_PROGRESS)
      },null,2)+"\n");
    '
    [[ -n "$archiver_pid" ]] || { echo ARCHIVER_NOT_RUNNING >&2; exit 1; }
    [[ "$failed_count" -eq 0 && -z "$last_failed_wal" ]] || { echo ARCHIVE_FAILURE >&2; exit 1; }

    if [[ "$current_segment" == "$expected" ]]; then
      (( current_offset > max_offset )) && max_offset="$current_offset"
      last_pre_switch_offset="$current_offset"
      last_pre_switch_at="$sampled_at"
    elif [[ -z "$switch_observed_at" ]]; then
      switch_observed_at="$sampled_at"
      switched_segment="$current_segment"
      [[ "$last_pre_switch_offset" -lt 16777216 ]] || { echo WAL_SEGMENT_FILLED_BY_WORKLOAD >&2; exit 1; }
    fi

    if [[ "$archived_count" -gt "$baseline_count" ]]; then
      [[ "$archived_count" -eq $((baseline_count+1)) && "$last_archived_wal" == "$expected" ]] || { echo ARCHIVE_SEQUENCE_MISMATCH >&2; exit 1; }
      [[ -n "$switch_observed_at" ]] || { echo ARCHIVE_WITHOUT_OBSERVED_NATURAL_SWITCH >&2; exit 1; }
      archive_confirmed_at="$last_archived_at"
      archive_sampled_at="$sampled_at"
      break
    fi
    sleep 1
  done
  [[ -n "$first_activity_at" && -n "$switch_observed_at" && -n "${archive_confirmed_at:-}" ]] || { echo ARCHIVE_TIMEOUT_NOT_AUTOMATIC >&2; exit 1; }
  archived_wal_bytes=$(stat -c '%s' "$work/archive/$expected")
  [[ "$archived_wal_bytes" -eq "$wal_segment_size" ]] || { echo ARCHIVED_WAL_SIZE_INVALID >&2; exit 1; }
  if [[ -z "$worker" ]]; then
    node scripts/wal-offsite.mjs "$work/plan.json" "$work/evidence/state.json" &
    worker=$!
  fi

  export WAL_DRILL_EXPECTED="$expected" WAL_DRILL_CYCLE="$cycle"
  for attempt in $(seq 1 120); do
    kill -0 "$worker" || { echo WAL_WORKER_EXITED >&2; exit 1; }
    if node --input-type=module -e '
      import {readFileSync} from "node:fs";
      try { const s=JSON.parse(readFileSync(process.env.WAL_DRILL_WORK+"/evidence/state.json"));
        process.exit(s.status==="PASSED"&&s.lastArchivedWal===process.env.WAL_DRILL_EXPECTED&&s.expectedSegments===Number(process.env.WAL_DRILL_CYCLE)?0:1);
      } catch { process.exit(1); }
    '; then uploaded=true; break; fi
    sleep 1
  done
  [[ "$uploaded" == true ]] || { echo UPLOAD_TIMEOUT >&2; exit 1; }
  node scripts/wal-offsite.mjs check "$work/evidence/state.json" 120000
  state=$(cat "$work/evidence/state.json")
  export WAL_CYCLE_STATE="$state" WAL_CYCLE_EXPECTED="$expected" WAL_CYCLE_START="$start_reference" \
    WAL_CYCLE_FIRST="$first_activity_at" WAL_CYCLE_LAST="$last_activity_at" \
    WAL_CYCLE_FIRST_SEGMENT="$first_activity_segment" WAL_CYCLE_SWITCH="$switch_observed_at" \
    WAL_CYCLE_SWITCH_LOWER="$last_pre_switch_at" WAL_CYCLE_ARCHIVE_SAMPLE="$archive_sampled_at" \
    WAL_CYCLE_PREVIOUS_SWITCH="$previous_switch_observed_at" WAL_CYCLE_SEGMENT="$switched_segment" \
    WAL_CYCLE_MAX_OFFSET="$max_offset" WAL_CYCLE_PRE_OFFSET="$last_pre_switch_offset" \
    WAL_CYCLE_COUNT="$transaction_count" WAL_CYCLE_BASELINE_COUNT="$baseline_count" \
    WAL_CYCLE_ARCHIVED_BYTES="$archived_wal_bytes" \
    WAL_CYCLE_BASELINE="$before" WAL_CYCLE_FINAL="$current"
  node --input-type=module -e '
    import {readFileSync,writeFileSync} from "node:fs";
    const w=process.env.WAL_DRILL_WORK+"/evidence/";
    const state=JSON.parse(process.env.WAL_CYCLE_STATE), before=JSON.parse(process.env.WAL_CYCLE_BASELINE), final=JSON.parse(process.env.WAL_CYCLE_FINAL);
    const receipt=state.receipts[process.env.WAL_CYCLE_EXPECTED];
    if (!receipt || receipt.status!=="VERIFIED" || receipt.object?.sse!=="AES256" || !receipt.object?.key.endsWith(".age")) throw new Error("OFFSITE_RECEIPT_INVALID");
    const n=Number(process.env.WAL_DRILL_CYCLE), sw=Number(process.env.WAL_CYCLE_SWITCH), switchLower=Number(process.env.WAL_CYCLE_SWITCH_LOWER), archiveSample=Number(process.env.WAL_CYCLE_ARCHIVE_SAMPLE), archived=Number(final.lastArchivedAt), uploaded=Number(state.lastVerifiedUploadAt), first=Number(process.env.WAL_CYCLE_FIRST), last=Number(process.env.WAL_CYCLE_LAST);
    writeFileSync(w+"cycle-"+n+"-stats.json",JSON.stringify({before,after:final},null,2)+"\n");
    writeFileSync(w+"cycle-"+n+".json",JSON.stringify({cycle:n,wal:process.env.WAL_CYCLE_EXPECTED,nextCurrentSegment:process.env.WAL_CYCLE_SEGMENT,
      archiveTimeoutSeconds:60,manualSwitchCalls:0,manualCheckpointCalls:0,transactionCount:Number(process.env.WAL_CYCLE_COUNT),
      priorNaturalSwitchObservedAt:Number(process.env.WAL_CYCLE_PREVIOUS_SWITCH),activityFirstAt:first,activityLastAt:last,
      firstActivitySegment:process.env.WAL_CYCLE_FIRST_SEGMENT,naturalSwitchDetectionLowerBoundAt:switchLower,naturalSwitchObservedAt:sw,
      naturalSwitchDelaySeconds:(sw-Number(process.env.WAL_CYCLE_PREVIOUS_SWITCH))/1000,
      firstActivityToSwitchUpperBoundSeconds:(sw-first)/1000,archiveConfirmedAt:archived,archiveConfirmationObservedAt:archiveSample,
      switchToArchiveSeconds:(archived-switchLower)/1000,uploadedVerifiedAt:uploaded,
      archiveToUploadSeconds:(uploaded-archived)/1000,firstActivityToOffsiteSeconds:(uploaded-first)/1000,
      lastActivityToOffsiteSeconds:(uploaded-last)/1000,archivedCountBefore:Number(process.env.WAL_CYCLE_BASELINE_COUNT),
      archivedCountAfter:Number(final.archivedCount),failedCountAfter:Number(final.failedCount),
      lastArchivedWalAfter:final.lastArchivedWal,archiverPid:final.archiverPid,
      checkpointerPid:final.checkpointerPid,
      walRecordsBefore:before.walRecords,walRecordsAfter:final.walRecords,
      checkpointerWaitEventAfter:final.checkpointerWaitEvent,
      checkpointerWaitEventTypeAfter:final.checkpointerWaitEventType,
      inRecoveryAfter:final.inRecovery,
      archivedWalBytes:Number(process.env.WAL_CYCLE_ARCHIVED_BYTES),
      currentSegmentMaxOffsetBeforeSwitch:Number(process.env.WAL_CYCLE_MAX_OFFSET),
      lastOffsetBeforeSwitch:Number(process.env.WAL_CYCLE_PRE_OFFSET),walSegmentSize:Number(JSON.parse(process.env.WAL_DRILL_SETTINGS).walSegmentSize||process.env.WAL_DRILL_SEGMENT_SIZE),
      receipt
    },null,2)+"\n");
    if (!(first<=switchLower&&switchLower<=sw&&archived<=archiveSample&&archiveSample<=uploaded) || Number(process.env.WAL_CYCLE_PRE_OFFSET)>=16777216) throw new Error("NATURAL_CYCLE_TIMING_INVALID");
  '
  cp "$work/evidence/state.json" "$work/evidence/state-cycle-$cycle.json"
  previous_switch_observed_at="$switch_observed_at"
  start_reference="$switch_observed_at"
  unset archive_confirmed_at
done

cp "$work/postgres.log" "$work/evidence/postgres.log"
node scripts/natural-wal-evidence.mjs "$work/evidence" "$work/evidence/summary.json"
mkdir -p artifacts/wal-offsite
cp "$work/evidence/"*.json artifacts/wal-offsite/
# No key material or WAL bytes are placed in logs/artifacts. Uploads contain
# only age ciphertext through the existing version-pinned IONOS transport.
