# Startup WAL readiness acceptance

## Required startup sequence

PostgreSQL starts on stock PostgreSQL 16.15 with its normal recovery process and
`archive_timeout=60`. The application remains unavailable while the readiness
controller waits for `pg_is_in_recovery() = false`. It then commits one
isolated, non-customer probe row, requests exactly one `pg_switch_wal()`, and
records the segment containing that switch. No normal Meterwerk workload is
admitted during these steps.

The gate waits for `pg_stat_archiver.last_archived_wal` to equal the recorded
segment without an increase in `failed_count`. The existing WAL pipeline then
uploads the encrypted segment to the run-specific `startup-wal/` prefix. Its
version-pinned readback confirms object presence, SSE-S3/AES256, ciphertext
SHA-256, age decryption, and plaintext SHA-256 against the archived WAL. Any
timeout, archive error, upload error, mismatch, or missing receipt leaves the
gate marker absent and application readiness false.

The marker is written atomically only after verification. When
`METERWERK_WAL_STARTUP_GATE_REQUIRED=true`, the application proxy returns 503
for normal requests until that marker is valid; only liveness and readiness
probes bypass the traffic block. `/api/health/ready` independently requires a
valid marker whenever PostgreSQL reports `archive_mode=on`. Deployments using
archiving must set the gate environment and marker path on each application
instance and configure the traffic controller to honor readiness.

The test probe and startup segment prove recovery protection only. Their timing
and transactions are excluded from Technical RPO. The 300-second target remains
unchanged. The separate steady-state proof starts after readiness and requires
three consecutive natural `archive_timeout=60` cycles, normal logged
transactions, no manual WAL switch, no forced checkpoint, no segment-filling
workload, and verified encrypted offsite objects.

## Current acceptance

The startup policy and readiness checks are implemented and covered by local
tests. The isolated stock PostgreSQL/IONOS proof is pending. Until the startup
gate and three post-ready natural cycles pass together, Technical RPO remains
failed/pending. The historical 305.630-second cycle in
[the stock PostgreSQL report](STOCK-PG16-20261110.md) remains failed evidence.
