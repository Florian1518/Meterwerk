# Technical recovery performance evidence — 2026-11-09

## Outcome

Resume update (2026-11-10): the already completed source diagnostic
[42637704239](PG16-TIMEOUT-42637704239.md) establishes an initial 300-second
checkpointer wait while startup recovery was active. All five later internal
important-record comparisons were true and requested natural switches.
The historical investigation below records the earlier state; the internal
diagnosis is now complete for this reproduction. Stock-binary natural-cycle
offsite acceptance and Technical RPO remain pending, including startup exposure.

This is non-production technical evidence, not an operational SLA. The accepted
end-to-end technical RTO measurements are Full Restore **7.471 s**, PITR
**8.068 s**, and Host Loss **28.613 s**. The conservative observed technical
RTO envelope is therefore **28.613 s**, limited to the synthetic scenarios and
their measured boundaries below.

The synthetic WAL drill sets PostgreSQL `archive_timeout=60`; this is a
test-harness setting, not a verified deployed setting. In accepted WAL run
[42595934065](https://github.com/Florian1518/Meterwerk/actions/runs/42595934065),
the maximum of three measured archive-confirmation-to-verified-offsite-upload
delays was **12.603525 s**. Adding those values gives a conditional technical
RPO bound of **72.603525 s** (about **72.604 s**) if the configured
`archive_timeout=60` cadence is effective. This is a calculated bound, not an
observed worst-case commit-to-offsite RPO: the cycles manually switched WAL,
and no natural timeout cycle was verified.

Two follow-up synthetic workflow runs attempted that additional check on the
isolated branch. Runs [42600455962](https://github.com/Florian1518/Meterwerk/actions/runs/42600455962)
and [42601200178](https://github.com/Florian1518/Meterwerk/actions/runs/42601200178)
both failed closed with the exact condition `ARCHIVE_TIMEOUT_NOT_AUTOMATIC`
after their three forced-switch upload cycles had passed. Those runs did not
retain enough runtime state to determine retrospectively whether their timed
segments had sufficient important WAL activity.

The follow-up instrumented attempts were also non-positive. Run
[42611695559](https://github.com/Florian1518/Meterwerk/actions/runs/42611695559)
failed in the diagnostic JSON query before the timed observation. Run
[42611990673](https://github.com/Florian1518/Meterwerk/actions/runs/42611990673)
confirmed PostgreSQL 16.15, `wal_level=replica`, `archive_mode=on`, a configured
local archive command, no `archive_library`, runtime `archive_timeout=60s`, and
live archiver PID. Twelve small committed inserts advanced the current LSN by
about 246 KiB in 118 seconds, while the current segment stayed at 5.52 MiB of
16 MiB; archive/failure counters stayed 0/0. This reproduction was not caused
by an idle database, a full segment, a missing archive command, or an observed
archive-command failure.

Run [42613286232](https://github.com/Florian1518/Meterwerk/actions/runs/42613286232)
failed before the timed test because the diagnostic query selected checkpoint
statistics from the wrong view. The corrected
[run 42613659743](https://github.com/Florian1518/Meterwerk/actions/runs/42613659743)
confirmed the timeout came from the configuration file with no pending
restart, `inRecovery=false`, active archiver/checkpointer PIDs, and
`CheckpointerMain`/`Activity` wait state at the initial and final samples. WAL
records rose from 23,771 to 24,303 and LSN advanced by about 246 KiB, while the
same 16 MiB segment remained open; archive and failure counts stayed 0/0. No
PostgreSQL `archive_timeout` switch message was logged. The exact internal
reason the live checkpointer did not request a switch remains undetermined;
the artifacts do not establish whether the important-record pointer check or
timer path was responsible. These failures are not positive evidence.

The disposable PostgreSQL 16.15 source diagnostic was attempted in workflow
[42621101392](https://github.com/Florian1518/Meterwerk/actions/runs/42621101392)
at SHA `2b7fdb01b4ca0399af048d68c4fa0b4817deb808`. The temporary build and
`pg_waldump` checks completed, but the run failed because it captured zero
instrumented timeout comparisons. Review of the compiler output found that
the diagnostic C strings incorrectly prefixed PostgreSQL's `INT64_FORMAT`
macro with `%`; the run therefore supplies no internal comparison values and
does not establish the root cause. Its synthetic WAL records were durable
Heap/COMMIT records, WAL grew from 5,275,718 to 5,560,984 bytes (about 280 KiB),
the segment stayed `000000010000000000000001`, and archiver counts remained
0/0. This diagnostic failure is not positive evidence. The harness has been
corrected to use the PostgreSQL format macros correctly and to check that the
instrumented binary is actually used; a successful source-level diagnostic is
still required before any stock-binary natural-cycle acceptance attempt.

Follow-up diagnostic workflow
[42633154371](https://github.com/Florian1518/Meterwerk/actions/runs/42633154371)
on SHA `21d0153725559a61da70b4df1eb6bfee77bf4e41` rebuilt PostgreSQL 16.15
and ran for four minutes. It logged one initial checkpointer callsite, then no
further timeout comparison; final `pg_stat_activity` still showed the same
checkpointer PID in `CheckpointerMain`/`Activity`. Because this run did not
record the checkpointer's computed wait duration or wake time, it cannot
distinguish an internal timer/configuration issue from a wait-loop issue and
does not establish the root cause. The disposable diagnostic now records those
values before and after `WaitLatch`; a successful source-level diagnostic is
still required before any stock-binary natural-cycle acceptance attempt. Full
CI run
[42633154372](https://github.com/Florian1518/Meterwerk/actions/runs/42633154372)
passed on the same SHA.

The next source diagnostic,
[42635642689](https://github.com/Florian1518/Meterwerk/actions/runs/42635642689)
at SHA `a891b4f30b7e8e288fd05b41c1e0f3fa2df89009`, recorded a checkpointer
WAIT at `2026-11-09T14:34:59Z`: runtime `XLogArchiveTimeout=60`,
`CheckPointTimeout=300`, `last_xlog_switch_time=1794234899`, elapsed time 0,
and computed `wait_seconds=300`. The disposable server ran until
`2026-11-09T14:39:00Z`, only 241 seconds after the wait began; it had not
woken, and therefore emitted no timeout comparison. PostgreSQL 16.15 caps
this wait at `archive_timeout` only when `!RecoveryInProgress()`. This points
to the checkpointer calculating its first sleep while startup recovery was
still active, before the SQL probe reported `pg_is_in_recovery()=false`; that
in-process boolean and subsequent LSN comparisons still need direct capture.
This failed source run is not positive RPO evidence. The next diagnostic
records the recovery boolean and continues long enough to observe the wake and
at least three 60-second intervals afterward.

No natural timeout cycle reached the encrypted offsite worker, so no new IONOS
object was created or verified. No production data, real hardware, bucket
configuration, existing object, or credential was accessed or changed.
Continuous WAL Offsite acceptance remains independently PASSED within its
previously accepted scope.

**Technical RTO evidence: PASSED for the three measured synthetic scenarios.**
**Technical RPO: CONDITIONAL ESTIMATE; cadence validation PENDING.**
**Combined Technical RPO/RTO evidence: PARTIAL. Operational/SLA RPO/RTO:
PENDING / NOT PROVEN.**

## Targets and acceptance table

The documented recovery objectives are a 5-minute RPO while continuous WAL is
available, with a daily full-backup fallback that can lose up to 24 hours; the
normal technical recovery objective is 4 hours and the compromised-host
objective is 8 hours. These are objectives, not service commitments.

| Metric                              | Target                                                 | Observed                                                                                                  | Evidence                                                                                                         | Status                            | Limitation                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WAL archive-to-offsite lag          | Included in 5-minute active-WAL RPO                    | Maximum **12.603525 s** over three cycles                                                                 | [WAL run 42595934065](WAL-OFFSITE-42595934065.md), cycle 3                                                       | Measured within accepted cycles   | Begins at archive confirmation, not source commit; all three used manual WAL switches                                                                        |
| Technical RPO estimate              | ≤300 s with active WAL; daily fallback ≤24 h           | **72.603525 s calculated** = synthetic 60 s setting + measured 12.603525 s maximum upload lag             | WAL run 42595934065 plus test-harness `archive_timeout=60`; natural timeout attempts 42600455962 and 42601200178 | **CONDITIONAL / PENDING**         | Test setting is not verified as deployed; cadence did not complete in either synthetic natural-timeout attempt; no observed worst-case commit-to-offsite RPO |
| Offsite Full Restore                | ≤4 h normal recovery                                   | **7.471 s**                                                                                               | Accepted Full Restore evidence; detailed phases in [Disaster Recovery](../DISASTER-RECOVERY.md)                  | **PASSED — synthetic technical**  | Start: external backup download; end: restore verification and application readiness; excludes real infrastructure provisioning                              |
| PITR                                | ≤4 h normal recovery                                   | **8.068 s**                                                                                               | Accepted PITR evidence in [Disaster Recovery](../DISASTER-RECOVERY.md)                                           | **PASSED — synthetic technical**  | Start: external base/WAL download; end: PITR target validation; does not include application readiness                                                       |
| Host Loss                           | ≤4 h normal; ≤8 h compromised host                     | **28.613 s**                                                                                              | [Host Loss run 42040140763](https://github.com/Florian1518/Meterwerk/actions/runs/42040140763)                   | **PASSED — synthetic technical**  | Empty isolated Docker daemon; measured through Restore Verifier and app readiness; excludes real host provisioning, DNS/TLS and operator coordination        |
| Conservative technical RTO envelope | ≤4 h normal objective                                  | **28.613 s**                                                                                              | Maximum of accepted Full Restore, PITR and Host Loss timings above                                               | **PASSED — synthetic technical**  | PITR ends at target validation while the other two include app readiness; all three scenario timings are retained as reported, without summing phases        |
| Application readiness after restore | Included in Full Restore / Host Loss end-to-end timing | **2.257 s** application-start-to-ready phase in Full Restore; Host Loss reached readiness within 28.613 s | Accepted Full Restore breakdown and Host Loss run 42040140763                                                    | **MEASURED — synthetic**          | No real service mesh, external DNS, TLS renewal, customer workload, or production traffic                                                                    |
| Verification overhead               | Included in Full Restore timing                        | **1.939 s** verifier phase                                                                                | Accepted Full Restore timing breakdown                                                                           | **MEASURED — synthetic**          | Component phase from that run; do not add it again to the end-to-end result                                                                                  |
| Monitoring detection delay          | Stale threshold configured at 120 s                    | **Not measured**; threshold is 120 s                                                                      | Accepted WAL run 42595934065 and WAL monitoring implementation                                                   | **PENDING**                       | No continuously deployed external polling/alert schedule was timed; 120 s is a detector threshold, not an observed alert delay                               |
| Failure handling                    | Fail closed on archive/upload/integrity/gap failure    | Exact deterministic negative conditions pass in accepted WAL run                                          | [WAL monitoring acceptance](WAL-OFFSITE-42595934065.md)                                                          | **PASSED — deterministic checks** | Fault injection proves classification, not live alert delivery, response time, remediation, or recovery under incident load                                  |

## Interpretation and remaining evidence

The accepted WAL run observed archive-to-verified-upload lag, but its three
cycles deliberately forced WAL switches. Therefore the measured 12.603525 s
cannot alone establish a bound from arbitrary commit time. The arithmetic
72.603525 s estimate combines that measured lag with the configured 60-second
archive cadence, conditional on the cadence being active. The two failed
natural-timeout runs prevent promoting that estimate to a demonstrated
technical RPO.

The 120-second stale threshold and exact deterministic stale/failure/gap
classifiers demonstrate monitoring logic. No independent, continuously
operating monitor or wall-clock alert path was measured, so detection delay and
operational failure handling remain unproven. Accepted restore timings do
demonstrate technical recovery performance in synthetic CI, but not
representative operational conditions or an SLA.

Next technical task: use the [completed internal diagnosis](PG16-TIMEOUT-42637704239.md)
to account explicitly for startup exposure, then use stock PostgreSQL 16.15
for three consecutive synthetic IONOS natural-cycle verifications before
changing Technical RPO from CONDITIONAL / PENDING.
Operational RPO/RTO still requires representative, authorized non-production
operational drills and measured alert/response behavior; no production work is
implied or authorized by this evidence.
