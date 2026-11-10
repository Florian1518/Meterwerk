# Independent WAL Watchdog and Notification Drill — 2026-11-10

This acceptance is isolated synthetic technical evidence. It is not Production monitoring or an Operational/SLA response drill.

## Architecture audit

- The pre-existing WAL watcher lived in `scripts/wal-offsite.mjs`. The worker loop was started by the `wal-offsite.yml` acceptance job; its `check` command was one-shot and required an external caller. CI ran tests but did not schedule monitoring.
- The worker read local JSON state/receipts and live `pg_stat_archiver`, plus validated offsite receipts. It used the plan poll interval (minimum 1 second), a default freshness window of 120 seconds in the drill, and subprocess timeout of 120 seconds. It persisted `FAILED` JSON and emitted a classification to stderr/nonzero exit.
- The only prior surfacing was local state/stdout/stderr and workflow failure/artifacts. There was no independent scheduler, pager, chat/email integration, or external notification credential configured.
- The new `wal-independent-watchdog.yml` runs independently of CI and application requests. Every five minutes it uses the GitHub Actions read-only API to inspect the newest `workflow_dispatch` run of `wal-offsite.yml`. A successful source run is considered fresh for 15 minutes; a failed run reports `PIPELINE_FAILURE`; an old run reports `STALE_PIPELINE`; API or missing-source errors report `WATCHDOG_INFRASTRUCTURE_FAILURE`. The watchdog does not contact the Meterwerk application, PostgreSQL, IONOS, or any bucket. If the application is unavailable, the GitHub runner can still query workflow metadata; GitHub API failure is unhealthy.
- The notification adapter sends an allowlisted JSON payload by HTTP POST to a separate synthetic receiver process. It has a 3-second timeout, checks a 2xx receipt with matching correlation ID and receipt timestamp, and fails the job on delivery failure. No external provider URL or credential was available, so the workflow uses only its loopback synthetic receiver. This proves adapter delivery, not delivery to an operator or external provider.

The upstream source is the latest offsite acceptance workflow run metadata, not a live service health endpoint or the run's WAL bytes. Repeated stale observations can generate repeated notifications; cross-run deduplication is not configured. These limits prevent treating this technical watchdog as production monitoring.

## Synthetic incidents, delivery and recovery

The tests inject isolated fixtures through the real WAL archive/upload/hash predicates, and the prior proxy readiness test supplies the startup-gate HTTP 503 condition. Notifications cross a process boundary to the synthetic receiver, which records receipt timestamps. Each case then restores a healthy synthetic observation; the alert remains earlier in append-only audit history. The acknowledgement field is null in every case: no human acknowledgement was simulated.

| Incident                 | Detection target                                     | Observed detection | Notification target | Observed delivery / incident-to-notification | Acknowledgement       | Recovery / incident-to-healthy | Fail-closed | Status                | Limitation                      |
| ------------------------ | ---------------------------------------------------- | -----------------: | ------------------- | -------------------------------------------: | --------------------- | -----------------------------: | ----------- | --------------------- | ------------------------------- |
| WAL upload failure       | Same watchdog poll                                   |           0.613 ms | 3 s                 |                                41 ms / 43 ms | Pending; no human ack |                  22 ms / 78 ms | Yes         | Technical test passed | Synthetic fault and receiver    |
| Stale pipeline           | Five-minute poll; alert after 15-minute source age   |           0.165 ms | 3 s                 |                                19 ms / 19 ms | Pending; no human ack |                  24 ms / 46 ms | Yes         | Technical test passed | GHA run metadata freshness only |
| WAL continuity gap       | Same watchdog poll                                   |           0.606 ms | 3 s                 |                                14 ms / 15 ms | Pending; no human ack |                  11 ms / 28 ms | Yes         | Technical test passed | Synthetic missing receipt       |
| Integrity/hash mismatch  | Same watchdog poll                                   |           9.523 ms | 3 s                 |                                 7 ms / 17 ms | Pending; no human ack |                  11 ms / 29 ms | Yes         | Technical test passed | Synthetic tampered ciphertext   |
| Startup WAL gate failure | Same watchdog poll; application request receives 503 |           0.140 ms | 3 s                 |                                17 ms / 17 ms | Pending; no human ack |                  12 ms / 29 ms | Yes         | Technical test passed | No deployed app traffic         |

The machine-readable evidence records injection, first failing observation, polling, detection, notification dispatch and receipt, acknowledgement, recovery action, healthy-again timestamps, calculated latencies, classification, and history-retention result. Detection and recovery timings are local synthetic test timings; they do not measure the five-minute scheduled-run delay. A healthy state is recorded only after the technical observation changes; acknowledgement is an append-only audit event and cannot change health.

## Operator acknowledgement

`node scripts/wal-alert-ack.mjs <audit.jsonl> <correlation-id> <operator-id>` appends an `ACKNOWLEDGED` event with the command-time UTC timestamp after finding the alert in the supplied audit file. It does not edit watchdog state. The command was not invoked with a fabricated operator identity; actual operator acknowledgement remains **PENDING**. The workflow run and artifact retain separate evidence for the alert and any later manual acknowledgement.

## Acceptance status

- **Technical Independent Watchdog: PARTIAL.** The scheduled workflow is configured for every five minutes, read-only and independent from application CI/requests. Its push-triggered execution is suitable for immediate validation. GitHub schedules execute only from the repository's default branch; this branch has not been merged, so a genuine `event=schedule` invocation of this new workflow is not yet observed.
- **Technical Notification Delivery: PASSED** for the isolated child-process receiver. No real external provider is configured.
- **Operator Acknowledgement: PENDING.** No real human acknowledgement occurred.
- **Operational/SLA Alert Response: PENDING.** The source is synthetic workflow metadata; schedule delay, external provider delivery, operator acknowledgement, and human recovery under representative conditions remain unmeasured.
- **Technical RPO/RTO: PASSED** for existing isolated synthetic acceptance; this drill changes neither result.
- **Genuine scheduled Recovery Validation: PASSED**, based on run 42666577374 (`event=schedule`, success). The Recovery Validation cron remains `23 7 * * 1` and was not changed.

No production systems, hardware, staging recovery, IAM, bucket policies, credentials, ContractUserId, or existing IONOS objects were accessed or changed.
