# Continuous WAL Offsite: synthetic implementation and acceptance

Status on 2026-11-09: **PASSED** for Phase-3 synthetic continuous WAL operation
and monitoring against real IONOS storage. This is not production deployment
or operational RPO/RTO acceptance. [External evidence](acceptance/WAL-OFFSITE-42595934065.md).
This work continues accepted baseline `91e57a5bdfe8cfa17795b27a4ea4549bbc029063`.
It does not restart Phase 3. Existing Full Restore 7.471 s, PITR 8.068 s,
Host Loss 28.613 s and runs 42041884271, 42040140763, 41791165665 remain
accepted historical evidence. Manual run `42595934065` independently verified
three incremental encrypted WAL cycles on `ddc8518f006c8c1aa2e152db37524321c098b643`.

## Audit and design

The existing `pitr-drill.sh` archives into a local isolated directory;
`offsite-wal-roundtrip.sh` transfers one age-encrypted base/archive bundle.
Neither demonstrates a continuous segment uploader. The existing
`offsite-storage.py` preflight can change public-access-block configuration.
The new transport deliberately does **not** invoke that preflight, change any
bucket setting/policy, rotate credentials, or delete any remote object.

`scripts/wal-offsite.mjs` repeatedly obtains live `pg_stat_archiver` data using
psql, computes the completed WAL range, encrypts each new segment using age,
and calls the existing `Store.put/get` transport through
`scripts/wal-offsite-transport.py`. Only the existing authorized IONOS bucket
and endpoint are accepted. Objects are retained under a unique GitHub
run/attempt prefix `phase3-acceptance/<run>-<attempt>/continuous-wal/`.
SSE-S3 AES256, versioning, private object ACL, content length and a non-null
object version are checked by the existing transport. The returned version is
downloaded and its SHA-256 compared, then age-decrypted and compared with the
original plaintext SHA-256. No credentials, private keys or WAL contents are
included in evidence. Every later poll re-downloads and verifies existing
versioned objects; a saved local receipt alone cannot establish success.

The worker atomically writes state containing last archive and last verified
upload timestamps (UTC epoch milliseconds), receipts and status. Failures
produce nonzero exit status; provider/subprocess payloads are suppressed.
An archive catching up is PENDING, never PASSED; archive lag beyond the budget
fails. A changed archiver failure counter fails even if files exist.
Successful rechecks do not refresh the original upload timestamp.

An **independent** monitor must run at least once per configured lag budget:

```sh
node scripts/wal-offsite.mjs check /isolated/path/state.json 120000
```

Nonzero means alert. Missing/malformed state, FAILED/PENDING status, future or
stale heartbeat fail closed. This catches a dead worker even when its last
state was PASSED. This command checks the heartbeat; the worker performs the
live PostgreSQL and offsite checks. There is no external alert delivery or
production service installed by this change.

## Synthetic runner

`.github/workflows/wal-offsite.yml` runs deterministic tests on relevant PRs
and scoped pushes to the WAL branch, using Ubuntu 24.04 runners.
Manual dispatch additionally prepares an isolated PostgreSQL 16 instance,
runner-owned Unix socket and archive directory, fresh age identity and one
persistent worker across three successive synthetic write/switch/archive/
upload cycles. It checks increasing continuity coverage and records times,
SHA, event and run ID. Archive wait is bounded to 60 seconds; upload wait to
90 seconds; freshness budget is 120 seconds. No staging, production, devices,
Docker/AppArmor changes, broad ownership/permission changes or remote deletes.
Only explicitly selected JSON evidence is uploaded, never identity or logs.

Required existing GitHub secrets: `IONOS_S3_ACCESS_KEY`, `IONOS_S3_SECRET_KEY`;
variables: `IONOS_S3_BUCKET`, `IONOS_S3_REGION`, `IONOS_S3_ENDPOINT`.
The workflow was published only on `software-completion/phase-3-wal-monitoring`
and manually dispatched successfully. No merge or tag was performed.
Its `workflow_dispatch` event is not `event=schedule` evidence.

## Local verification

Working branch: `software-completion/phase-3-wal-monitoring`, based on the
existing clean `.local/phase3-apparmor-fix` worktree. The root `master`
worktree already had unrelated changes; those were preserved.

Commands (from the worktree; local package binaries used because pnpm is not
on PATH):

```powershell
$env:PATH = 'C:/Program Files/Git/bin;' + $env:PATH
node --test tests/wal-offsite.test.mjs tests/pitr-archive.test.mjs tests/recovery-negative-result.test.mjs scripts/hostloss-apparmor.test.mjs
bash -n scripts/wal-offsite-drill.sh
node node_modules/eslint/bin/eslint.js scripts/wal-offsite.mjs tests/wal-offsite.test.mjs
$env:DATABASE_URL = 'postgresql://127.0.0.1:55439/synthetic'
node node_modules/prisma/build/index.js generate
node node_modules/vitest/vitest.mjs run tests/disaster-recovery.test.ts tests/dr-recovery.test.ts tests/backup.test.ts
node node_modules/typescript/bin/tsc --noEmit
node scripts/secret-scan.mjs
node scripts/docs-check.mjs
git diff --check
```

Results: 70/70 Node tests passed (968.090 ms); 15/15 DR/backup tests passed
(3.41 s); generation, typecheck, focused ESLint and Bash syntax passed.
Secret scan: zero review findings. Initial AppArmor test execution lacked
Bash on PATH; rerun with explicit Git Bash passed without changing controls.
Initial DR execution lacked generated Prisma client; generation using the
synthetic URL fixed it without connecting to a database.

Python/age/PostgreSQL end-to-end transport was **not executed locally**:
Python/age were unavailable on PATH and the Docker Linux engine was not
running. Python compilation and all eight existing storage tests passed in
the external WAL workflow, including the real age/PostgreSQL/IONOS drill.
No full application build or database integration suite was run for this
standalone scripts/docs change. Measured synthetic archive-to-upload latency
is recorded separately in the external evidence; no operational RPO/RTO is claimed.

Read-only GitHub baseline verification returned run `42041884271`, conclusion
`success`, SHA `91e57a5bdfe8cfa17795b27a4ea4549bbc029063`, event `push`.
Command from repository root:
`node .local/phase2-github.mjs GET actions/runs/42041884271 - .local/wal-baseline-ci.json`.
The sandbox initially blocked Windows credential access; the approved retry
downloaded the API result, then Node 24 reported a Windows shutdown assertion
and exited 1. The downloaded JSON was read and verified separately; this was
not a successful new workflow execution.

## Limits and remaining acceptance

Continuity is verified only for the explicit first segment through the latest
completed segment, on one timeline and the configured segment size. Timeline
changes, invalid names/sizes and ranges of 10,000 or more segments fail closed;
timeline history and long-term retention/catalog rotation are not implemented.
This is a bounded synthetic acceptance worker, not a deployed production WAL
service. The probe's idle archive timeout is 60 s; an idle/stalled source can
intentionally trigger the freshness alarm. Recovery still needs an appropriate
base backup and separately recoverable age key; the ephemeral drill key is
not an operational key-management solution. Operative RPO/RTO remains open.

**Next:** obtain and verify genuine `event=schedule` evidence for the existing
recovery workflow. Inspect existing runs first; manual dispatch cannot satisfy
that requirement. Keep the WAL scope and operational RPO/RTO limits separate.

IAM Least Privilege remains **BLOCKED** until IONOS supplies the real
ContractUserId; do not derive it or create/apply a policy. Staging Recovery
remains **BLOCKED** until an expressly approved read-only source/principal
exists. Genuine schedule evidence and operational RPO/RTO remain separate.
