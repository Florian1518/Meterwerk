import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve(
  process.argv[2],
  "src/backend/postmaster/checkpointer.c",
);
let source = readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
const startMarker = "static void\nCheckArchiveTimeout(void)\n{";
const endMarker =
  "\n/*\n * Returns true if an immediate checkpoint request is pending.";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

assert(
  start >= 0 && end > start,
  "PostgreSQL REL_16_15 CheckArchiveTimeout source shape changed",
);
assert.equal(
  source.indexOf(startMarker, start + 1),
  -1,
  "Expected one CheckArchiveTimeout implementation",
);

const diagnosticFunction = `static void
CheckArchiveTimeout(void)
{
  pg_time_t now;
  pg_time_t last_time;
  pg_time_t last_xlog_switch_time_before;
  XLogRecPtr last_switch_lsn;
  XLogRecPtr important_lsn;
  XLogRecPtr insert_lsn;
  XLogRecPtr switchpoint;
  XLogSegNo segno;
  char segment_name[MAXFNAMELEN];
  bool important_wal;

  if (XLogArchiveTimeout <= 0 || RecoveryInProgress())
    return;

  now = (pg_time_t) time(NULL);
  last_xlog_switch_time_before = last_xlog_switch_time;
  elog(LOG,
       "PG16_TIMEOUT_DIAG phase=EVALUATION now=" INT64_FORMAT
       " timeout=%d checkpointer_pid=%d last_xlog_switch_time_before="
       INT64_FORMAT " recovery=%d",
       (int64) now, XLogArchiveTimeout, MyProcPid,
       (int64) last_xlog_switch_time_before, RecoveryInProgress());

  /* First we do a quick check using possibly-stale local state. */
  if ((int) (now - last_xlog_switch_time) < XLogArchiveTimeout)
    return;

  /* Refresh the time and LSN for the latest segment switch. */
  last_time = GetLastSegSwitchData(&last_switch_lsn);
  last_xlog_switch_time = Max(last_xlog_switch_time, last_time);
  important_lsn = GetLastImportantRecPtr();
  important_wal = important_lsn > last_switch_lsn;
  insert_lsn = GetInsertRecPtr();
  XLByteToSeg(insert_lsn, segno, wal_segment_size);
  XLogFileName(segment_name, 1, segno, wal_segment_size);

  elog(LOG,
       "PG16_TIMEOUT_DIAG phase=COMPARISON now=" INT64_FORMAT
       " timeout=%d checkpointer_pid=%d last_xlog_switch_time_before="
       INT64_FORMAT " get_last_seg_switch_data_time=" INT64_FORMAT
       " last_xlog_switch_time_after_refresh=" INT64_FORMAT
       " last_switch_lsn=%X/%08X important_lsn=%X/%08X important_wal=%d"
       " insert_lsn=%X/%08X segment_before=%s",
       (int64) now, XLogArchiveTimeout, MyProcPid,
       (int64) last_xlog_switch_time_before, (int64) last_time,
       (int64) last_xlog_switch_time,
       LSN_FORMAT_ARGS(last_switch_lsn), LSN_FORMAT_ARGS(important_lsn),
       important_wal, LSN_FORMAT_ARGS(insert_lsn), segment_name);

  if ((int) (now - last_xlog_switch_time) >= XLogArchiveTimeout)
  {
    if (important_wal)
    {
      elog(LOG,
           "PG16_TIMEOUT_DIAG phase=REQUEST invoked=1 checkpointer_pid=%d",
           MyProcPid);
      switchpoint = RequestXLogSwitch(true);
      insert_lsn = GetInsertRecPtr();
      XLByteToSeg(insert_lsn, segno, wal_segment_size);
      XLogFileName(segment_name, 1, segno, wal_segment_size);
      elog(LOG,
           "PG16_TIMEOUT_DIAG phase=RETURN switchpoint=%X/%08X"
           " insert_lsn=%X/%08X segment_after=%s checkpointer_pid=%d",
           LSN_FORMAT_ARGS(switchpoint), LSN_FORMAT_ARGS(insert_lsn),
           segment_name, MyProcPid);
      if (XLogSegmentOffset(switchpoint, wal_segment_size) != 0)
        elog(DEBUG1, "write-ahead log switch forced (archive_timeout=%d)",
             XLogArchiveTimeout);
    }
    else
      elog(LOG,
           "PG16_TIMEOUT_DIAG phase=REQUEST invoked=0"
           " reason=IMPORTANT_WAL_NOT_AFTER_LAST_SWITCH checkpointer_pid=%d",
           MyProcPid);

    /* Preserve PostgreSQL's existing timer update semantics. */
    last_xlog_switch_time = now;
    elog(LOG,
         "PG16_TIMEOUT_DIAG phase=TIMER_UPDATED"
         " last_xlog_switch_time_after=" INT64_FORMAT
         " checkpointer_pid=%d",
         (int64) last_xlog_switch_time, MyProcPid);
  }
}
`;

source = source.slice(0, start) + diagnosticFunction + source.slice(end);

const callsite = "\t\tCheckArchiveTimeout();";
assert(
  source.includes(callsite),
  "Expected CheckArchiveTimeout call sites in checkpointer source",
);
source = source.replaceAll(
  callsite,
  `\t\telog(LOG, "PG16_TIMEOUT_DIAG phase=CALLSITE checkpointer_pid=%d", MyProcPid);\n${callsite}`,
);
writeFileSync(sourcePath, source);
console.log("Patched only the disposable PostgreSQL REL_16_15 source checkout");
