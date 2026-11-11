# Independent watchdog integration

Base verified by fetch on 2026-11-11: `9c04c2ebaf39227189ff586d5fd8df6f249054fe`.
Branch: `integration/phase-3-independent-watchdog`.

## Dependency audit

Only the watchdog workflow, three watchdog/receiver/acknowledgement scripts,
watchdog test and original synthetic acceptance records are imported from
`95afeff875420205ede1a1c7a1e5660cc9e0c5db`. The imported records are historical
evidence, not evidence of this integration or a scheduled run on master.
The watchdog tests additionally require `scripts/wal-offsite.mjs` and
`tests/wal-offsite.test.mjs` from `8916113`. Their imports are Node built-ins;
the tests inject synthetic transports and codecs. The offsite CLI is not run.
Its transport script, credentials and offsite workflow are deliberately outside
this integration. No ancestor commit or complete prerequisite branch is merged.

CI runs both imported test files after the existing unit tests and uploads
synthetic evidence with the existing SHA-pinned artifact action. The original
operational-alert CI context is not needed. Application and recovery workflows
are unchanged.

## Operation and limitations

The independent workflow polls GitHub workflow metadata every five minutes.
It reads the latest manual run of `wal-offsite.yml`, with a 15-minute freshness
limit, and delivers alerts only to its separate loopback synthetic receiver.
It does not inspect live WAL bytes or contact infrastructure. The source workflow
is absent from the master tree, but the public GitHub API verified its active
registration (workflow ID `411908230`) and latest manual run `42819079627`
(`success`, source SHA `b630f2258d2531080848c5774b09ccccfd1485e3`, updated
`2026-11-10T12:59:13Z`). This observation is already stale and must produce
`STALE_PIPELINE`, not healthy status. Missing metadata fails closed.
A successful watchdog job can mean successful delivery of an unhealthy alert;
inspect `state.json`, `audit.jsonl` and `received.jsonl`, not just job success.
Cross-run deduplication and external operator delivery are not configured.

Run isolated regression coverage with:

```sh
node --test tests/wal-watchdog.test.mjs tests/wal-offsite.test.mjs tests/recovery-negative-result.test.mjs tests/pitr-archive.test.mjs
```

Only a post-merge run of `wal-independent-watchdog.yml` with `event == schedule`
can establish scheduled execution. Push and manual dispatch runs cannot.

## Acceptance

Local validation on 2026-11-11: all 66 isolated Node watchdog/WAL/recovery tests,
20 targeted DR/readiness/proxy tests, typecheck (including Prisma generation),
lint, production build, formatting, documentation links and validation,
secret scan (zero findings), workflow security and action pinning, and Bash
syntax for CI/watchdog inline scripts and existing shell scripts passed.
The complete Vitest run passed all 564 tests; one Windows temporary-directory
cleanup failed, and that suite subsequently passed in isolation (2 tests).
Security regression passed 77 tests. All four integration suites passed
(18 access, 8 import, 6 data-quality and 7 rules checks) against a fresh local
demo database with 50 migrations; the database was stopped afterward.
No remote CI result or scheduled execution is implied by these local checks.

- Technical Independent Watchdog: **PARTIAL**, genuine schedule evidence pending.
- Technical RPO/RTO: **PASSED**, existing acceptance preserved.
- Operational/SLA Alert Response: **PENDING**.
- Operator Acknowledgement: **PENDING**.

No production, real hardware, Staging Recovery, IAM, bucket policy, credential,
ContractUserId or existing IONOS evidence changes are part of this integration.
