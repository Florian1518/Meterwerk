# Genuine Scheduled Recovery Evidence — 2026-11-09

**PENDING. No qualifying scheduled Recovery Validation run exists in the API
results inspected at 2026-11-09 10:03:45 UTC.** No run was dispatched, rerun,
relabelled or manufactured. No code, workflow or cron change was necessary.

[Machine-readable API evidence, job steps and artifact hashes](SCHEDULE-RECOVERY-20261109.json).

## Repository and schedule eligibility

- Working branch: `software-completion/phase-3-wal-monitoring`; starting SHA
  `e3e5108f54de810cc9836388df650b86da48777e`; isolated tree initially clean.
- Remote default branch: `master`, SHA `9c04c2ebaf39227189ff586d5fd8df6f249054fe`.
- Workflow: `Recovery Validation`, ID `404557168`, state `active`, file
  `.github/workflows/recovery-validation.yml` exists on that default branch.
- Repository Actions enabled; repository neither archived nor disabled.
- Cron unchanged: `23 7 * * 1`, every Monday at **07:23 UTC**.
- The 2026-11-09 07:23 UTC window had elapsed at inspection time, but no Recovery
  schedule run was visible. Cause is not established; configuration eligibility
  is not proof that GitHub delivered the event.
- Next configured window: **2026-11-16 07:23 UTC / 08:23 Europe/Berlin**. A delayed
  November 9 event could still appear; re-query before assuming it was dropped.

The workflow on the default branch is byte-equivalent to the inspected working
branch workflow. Its `isolated-recovery` job has no event-dependent condition.
Push/PR path filters do not gate the separate schedule trigger. All required
steps run on the normal success path; only failure-artifact upload is guarded
by `failure()`, and cleanup uses `always()`. There is no `continue-on-error` or
schedule-specific bypass. Concurrency queues matching runs without cancelling
an existing recovery run.

The path uses ephemeral PostgreSQL, synthetic seeds, age-encrypted local backup,
isolated restore, PITR and negative recovery checks, restored application/MQTT
readiness, migration recovery and the mandatory complete-evidence verifier.
No IONOS credentials or bucket mutation are configured in this workflow; its
offsite-denial checks use local mocks. Cleanup affects runner-local resources.

GitHub documents that schedules use the default branch and can be delayed or
dropped under load; that is a possible platform behavior, **not an established
explanation for this repository's missing run**.
[GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Actual run search

`GET actions/workflows/recovery-validation.yml/runs?event=schedule&per_page=100`
returned `total_count: 0`, an empty run list. A separate repository-wide
`GET actions/runs?event=schedule&per_page=100` returned six runs, all for
`Supported image vulnerabilities`, workflow ID `404237428`. None ran recovery;
even the successful ones are not substitutes for this acceptance gate.

### Recheck after the RPO/RTO work

At the later read-only recheck on 2026-11-09, workflow metadata still reported
`Recovery Validation` (`404557168`) as active. The workflow-specific
`event=schedule` query again returned `total_count: 0`; the repository-wide
schedule query returned six runs, and none were Recovery Validation. Therefore
no qualifying schedule run appeared during this continuation and the gate
remains **PENDING**. The `workflow_dispatch` WAL drills in this continuation
are unrelated and are not counted as schedule evidence. Cron remains unchanged
at `23 7 * * 1`.

Accordingly, qualifying run ID, event, executed SHA, created/updated timestamps,
conclusion, jobs and artifacts are **not available**. They are null/empty in the
evidence record rather than populated with an unrelated successful run.

## Non-qualifying default-branch control

[Run 41791165665](https://github.com/Florian1518/Meterwerk/actions/runs/41791165665)
remains a valid historical recovery control, explicitly **not** schedule evidence:

- Event `push`, attempt 1, branch `master`, executed SHA
  `9c04c2ebaf39227189ff586d5fd8df6f249054fe` (the current default-branch SHA).
- Created `2026-11-04T07:16:54Z`; updated `2026-11-04T07:19:13Z`; success.
- Job `126444635633`, `Synthetic encrypted backup, full restore and PITR`: success.
  Every required validation succeeded. The only skipped step was the
  failure-only artifact upload, consistent with a successful run.
- Artifact `13303666760`, `synthetic-recovery-evidence`, not expired;
  `workflow_run.id`, branch and SHA match the control run itself.
- Seven files: recovery and host-loss evidence, encrypted-backup manifest,
  archive evidence, positive PITR, missing-WAL and incomplete-base results.
- Existing `verify-recovery-evidence.mjs` revalidated the downloaded evidence:
  `Recovery evidence complete and secret-free`. The verifier and both classifier
  dependencies are unchanged from the control SHA. All seven file hashes are
  recorded in the JSON, without copying raw logs or secret material.

This supports the intended path's eligibility, not future runtime availability
or a guarantee of scheduler delivery. No weakening or speculative repair was
justified by the inspected configuration and successful control.

## Commands and next acceptance action

Read-only API helper `.local/schedule-api.mjs` was used from repository root;
it keeps Git credentials in memory and writes API responses to ignored local
files. Requests included repository/default-branch metadata, Actions permissions,
workflow metadata/content, the two schedule run searches, the recent Recovery
run list, and control run/jobs/artifacts. No dispatch/enable/update API was used.

```powershell
node .local/schedule-api.mjs 'actions/workflows/recovery-validation.yml/runs?event=schedule&per_page=100' .local/schedule-runs.json
node .local/schedule-api.mjs 'actions/runs?event=schedule&per_page=100' .local/schedule-all-runs.json
node .local/schedule-api.mjs branches/master .local/schedule-default-branch.json
node .local/schedule-api.mjs 'contents/.github/workflows/recovery-validation.yml' .local/schedule-default-workflow.json
node .local/schedule-api.mjs actions/runs/41791165665/jobs .local/schedule-default-control-jobs.json
node .local/schedule-api.mjs actions/runs/41791165665/artifacts .local/schedule-default-control-artifacts.json
node .local/schedule-api.mjs actions/artifacts/13303666760/zip .local/schedule-default-control-evidence.zip
node .local/record-schedule-audit.mjs
```

From the isolated worktree, after extraction:

```powershell
node scripts/verify-recovery-evidence.mjs ../schedule-default-control-evidence/recovery-evidence.json ../schedule-default-control-evidence/host-loss-evidence.json ../schedule-default-control-evidence/meterwerk-pitr-evidence
```

**Next task:** re-query for a delayed November 9 `schedule` run; otherwise inspect
the unchanged November 16 07:23 UTC cron execution. Require `event=schedule`,
attempt 1, the actual default-branch SHA, successful required job/steps and its
own normal artifacts. Download and verify those artifacts before changing this
gate to PASSED. A dispatch or rerun is not a substitute. Do not change cron to
accelerate acceptance. If the next window also produces no run, investigate
GitHub scheduler delivery with these API facts; the current cause is unknown.

Preserved: Full Restore 7.471 s, PITR 8.068 s, Host Loss 28.613 s / `42040140763`,
WAL acceptance `42595934065`, full CI `42595857254`, Recovery `42595857268`.
IAM Least Privilege remains BLOCKED on the real IONOS ContractUserId; Staging
Recovery remains BLOCKED on an approved source/principal. Operational RPO/RTO
remains NOT PROVEN. Production, hardware, bucket configuration and credentials
were not accessed or changed.
