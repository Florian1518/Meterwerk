# Technical recovery performance evidence — 2026-11-09

## Outcome

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
after their three forced-switch upload cycles had passed. The latter also
kept generating synthetic WAL while waiting. These failed attempts are not
positive RPO evidence; the temporary probe was reverted. No production data,
real hardware, bucket configuration, existing object, or credential was
accessed or changed. Continuous WAL Offsite acceptance remains independently
PASSED within its previously accepted scope.

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

Next technical task: diagnose why the isolated PostgreSQL 16 drill did not
archive a naturally timed segment despite `archive_timeout=60`, add a narrowly
scoped deterministic regression check, and obtain a successful synthetic
natural-cycle run before changing Technical RPO from CONDITIONAL / PENDING.
Operational RPO/RTO still requires representative, authorized non-production
operational drills and measured alert/response behavior; no production work is
implied or authorized by this evidence.
