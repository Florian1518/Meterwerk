# Release Candidate Acceptance Checklist

RC version: \***\*\_\_\*\*** Git SHA: \***\*\_\_\*\*** Environment: \***\*\_\_\*\*** Date: \***\*\_\_\*\***

Mark each item `PASSED`, `FAILED`, `NOT_EXECUTED`, `EXTERNAL_VALIDATION_PENDING` or `HARDWARE_VALIDATION_PENDING`. Attach evidence or finding reference; do not treat unchecked/unknown as passed.

## Source and build

- [ ] Git working tree clean; tag/SHA and package version recorded
- [ ] CI green for exact SHA
- [ ] Prisma validate and generate
- [ ] Migration inventory and clean-install / upgrade path checked on isolated test DB
- [ ] Unit tests
- [ ] Integration and Tenant-Isolation tests
- [ ] HTTP/API tests
- [ ] Browser/E2E tests
- [ ] Production build
- [ ] Release artifact metadata, SBOM, signing status documented

## Security and dependencies

- [ ] Auth/MFA, CSRF, injection, XSS, SSRF, uploads, API keys and webhook regressions
- [ ] SUPER_ADMIN and Cross-Tenant authorization tests
- [ ] Secret scan
- [ ] Dependency audit and lockfile review
- [ ] CI permissions/action pins and artifact contents checked
- [ ] Known findings and limitations reviewed

## Product acceptance

- [ ] Metering across four media, units, aggregation, costs and exports
- [ ] Connectivity software tests; hardware status separately recorded
- [ ] Analytics, forecast, rules, alarms, reports
- [ ] WorkOrders, attachments, device/fleet and support flows
- [ ] Public API and webhook delivery/error paths
- [ ] Demo seed/scenarios/guards; Production reset blocked
- [ ] PWA/mobile and cache/offline behavior

## Operations and release

- [ ] Liveness/readiness/build info and worker/queue status
- [ ] Backup verification, restore guards, DR status
- [ ] Staging deployment and smoke/E2E acceptance
- [ ] External storage/mail/MQTT/monitoring tests, if required
- [ ] PITR/restore drill status recorded; no theoretical test marked passed
- [ ] Rollback and migration compatibility reviewed
- [ ] Release notes/changelog updated
- [ ] No production deploy without explicit approval

## Findings and decision

- Release blockers: \***\*\_\_\*\***
- Major/minor findings: \***\*\_\_\*\***
- External validation pending: \***\*\_\_\*\***
- Hardware validation pending: \***\*\_\_\*\***
- Decision / approver role: \***\*\_\_\*\***
