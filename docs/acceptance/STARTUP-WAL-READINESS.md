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

The startup policy and readiness checks are implemented, fail closed, and are
covered by readiness/proxy tests: normal requests receive HTTP 503 without
valid evidence; readiness remains false until the controller writes the
verified marker. Run
[42791806505](https://github.com/Florian1518/Meterwerk/actions/runs/42791806505)
verified its one-time startup switch and isolated `.age` upload in 6.366 s,
but its first post-ready natural cycle took 300.579 s. That run remains failed
evidence and showed the app must stay closed through a verified natural
post-recovery warm-up as well.

Run
[42816631791](https://github.com/Florian1518/Meterwerk/actions/runs/42816631791)
completed the extended gate in 305.950 s, including a 300.262 s natural
warm-up, and uploaded both startup segments to its isolated prefix. Its three
post-ready RPO measurements were 60.591, 62.559, and 70.841 s. The workflow
remains failed because the verifier rejected a boundary transaction in the
third WAL segment: its commit preceded the previous switch-observation sample
by 26.791 ms. The verifier had incorrectly required the previous sampled
observation to precede every transaction in the next segment. The check now
allows this sampling race while requiring that observation to precede the
segment's final transaction. This failed run remains unaccepted evidence.

The corrected proof
[42819079627](https://github.com/Florian1518/Meterwerk/actions/runs/42819079627)
passed on stock PostgreSQL 16.15 with `archive_timeout=60`. The application
gate stayed closed for **306.108 s** total: the startup segment was verified,
then the natural warm-up segment was archived and verified after **300.428 s**.
The run used exactly one `pg_switch_wal()` for startup, zero manual switches or
checkpoints in steady state, normal logged synthetic transactions, and no
segment-filling workload. No customer data was used. The CI proxy test verifies
normal application requests are rejected before a valid gate marker; the
marker is absent on every error/timeout path.

The startup objects were
`phase3-acceptance/42819079627-1/startup-wal/000000010000000000000001.age`
and
`phase3-acceptance/42819079627-1/startup-wal/000000010000000000000002.age`.
Version-pinned IONOS readbacks passed ciphertext SHA-256, age decryption,
plaintext SHA-256, and SSE-S3/AES256 checks. The independent verifier accepted
all three post-ready natural cycles:

| WAL segment                | Natural switch interval | Transactions | Worst commit to verified offsite |
| -------------------------- | ----------------------: | -----------: | -------------------------------: |
| `000000010000000000000003` |                53.964 s |            5 |                         61.456 s |
| `000000010000000000000004` |                60.072 s |            6 |                         68.380 s |
| `000000010000000000000005` |                60.120 s |            5 |                         63.672 s |

The worst steady-state Technical RPO was **68.380 s**, below the unchanged
300-second target. All three `.age` receipts verified with SSE-S3/AES256,
ciphertext and plaintext SHA-256 checks, and age decryption, under
`phase3-acceptance/42819079627-1/continuous-wal/`. The run's full
summary and raw logs are in the
[`synthetic-wal-offsite-42819079627` workflow artifact](https://github.com/Florian1518/Meterwerk/actions/runs/42819079627).
Technical RPO is **PASSED** under this startup-protection policy. Technical
RTO remains **PASSED**; combined Technical RPO/RTO evidence is **PASSED**.
Operational/SLA RPO/RTO and genuine scheduled-run evidence remain **PENDING**.
IAM Least Privilege remains blocked on the ContractUserId; Staging Recovery
remains blocked.

The historical 305.630-second cycle in
[the stock PostgreSQL report](STOCK-PG16-20261110.md) remains failed evidence.
