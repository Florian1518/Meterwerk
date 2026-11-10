# Startup WAL readiness acceptance

## Required startup sequence

PostgreSQL starts on stock PostgreSQL 16.15 with its normal recovery process and
`archive_timeout=60`. The application remains unavailable while the readiness
controller waits for `pg_is_in_recovery() = false`. It then commits one
isolated, non-customer probe row, requests exactly one `pg_switch_wal()`, and
records the segment containing that switch. No normal Meterwerk workload is
admitted during these steps. The gate also checks the configured 16 MiB segment
size and records the startup switch separately from subsequent WAL cycles.

The gate waits for `pg_stat_archiver.last_archived_wal` to equal the recorded
segment without an increase in `failed_count`. The existing WAL pipeline then
uploads the encrypted segment to the run-specific `startup-wal/` prefix. Its
version-pinned readback confirms object presence, SSE-S3/AES256, ciphertext
SHA-256, age decryption, and plaintext SHA-256 against the archived WAL.

The application remains closed after that manual startup segment is verified.
An isolated probe commit keeps harmless WAL activity in the active segment
while the post-recovery checkpointer sleep drains. The gate waits for that
segment to switch naturally under `archive_timeout=60`, confirms the PostgreSQL
`archive_timeout` log entry and `pg_stat_archiver` result, and verifies its
separate `.age` object through the same readback and integrity checks. This
natural warm-up is startup protection evidence, not a steady-state RPO cycle.
It uses no additional manual switch. Any timeout, archive error, upload error,
mismatch, or missing receipt leaves the gate marker absent and application
readiness false.

The marker is written atomically only after verification. When
`METERWERK_WAL_STARTUP_GATE_REQUIRED=true`, the application proxy returns 503
for normal requests until that marker is valid; only liveness and readiness
probes bypass the traffic block. `/api/health/ready` independently requires a
valid marker whenever PostgreSQL reports `archive_mode=on`. Deployments using
archiving must set the gate environment and marker path on each application
instance and configure the traffic controller to honor readiness.

The test probes, startup manual segment, and natural warm-up prove recovery
protection only. Their timing and transactions are excluded from Technical
RPO. The 300-second target remains unchanged. The separate steady-state proof
starts after readiness and requires three consecutive natural
`archive_timeout=60` cycles, normal logged transactions, no manual WAL switch,
no forced checkpoint, no segment-filling workload, and verified encrypted
offsite objects.

## Current acceptance

The startup policy and readiness checks are implemented and covered by local
tests. Run
[42791806505](https://github.com/Florian1518/Meterwerk/actions/runs/42791806505)
verified its one-time startup switch and isolated `.age` upload in 6.366 s,
but its first post-ready natural cycle took 300.579 s. That run remains failed
evidence and showed the app must stay closed through a verified natural
post-recovery warm-up as well.

Run
[42816631791](https://github.com/Florian1518/Meterwerk/actions/runs/42816631791)
then completed the extended gate: total closed time was 305.950 s, including a
300.262 s natural warm-up; both startup segments were uploaded under the new
isolated prefix `phase3-acceptance/42816631791-1/startup-wal/` and verified.
The three post-ready transaction-to-verified-offsite measurements were 60.591,
62.559, and 70.841 s (worst 70.841 s), with three natural switches and
verified encrypted receipts under that run's `continuous-wal/` prefix. The
workflow correctly remained failed because the evidence verifier rejected a
boundary transaction in the third WAL segment: its commit preceded the
previous switch-observation sample by 26.791 ms. All timestamps and receipt
ordering were otherwise valid. The verifier had incorrectly required the
previous sampled observation to precede every transaction in the next segment;
the check now allows this sampling race while requiring the observation to
precede that segment's final transaction. The raw run remains failed and is not
counted as accepted proof. A fresh workflow run with the corrected verifier is
required.

Until a workflow run accepts the startup gate and three post-ready natural
cycles together, Technical RPO remains failed/pending. The historical
305.630-second cycle in
[the stock PostgreSQL report](STOCK-PG16-20261110.md) remains failed evidence.
