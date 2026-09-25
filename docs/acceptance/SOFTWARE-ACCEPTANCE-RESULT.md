# Software Acceptance Result

- Baseline / HEAD: `f444ea62207ed532b4329c29b9396e4703902ecc`
- Package version: `0.1.0`
- Recorded at: `2026-09-25T14:13:17.704Z`
- Scope: local software checks executed by `pnpm acceptance:software`.

## Executed checks

- **PASSED** — Prisma validate (exit 0)
- **PASSED** — Prisma generate (exit 0)
- **PASSED** — Typecheck (exit 0)
- **PASSED** — ESLint (exit 0)
- **PASSED** — Prettier (exit 0)
- **PASSED** — Unit tests (exit 0)
- **PASSED** — Security regression (exit 0)
- **PASSED** — Documentation links (exit 0)
- **PASSED** — Documentation references (exit 0)
- **PASSED** — Secret scan (exit 0)
- **PASSED** — Dependency audit (exit 0)
- **PASSED** — Staging Compose syntax (exit 0)
- **PASSED** — Production build (exit 0)

## Not executed by this command

- PostgreSQL clean-install / upgrade integration tests and HTTP/API suites requiring a dedicated test database.
- Docker/Web/Worker images, staging runtime/promotion, browser E2E against a running environment, and provider-backed storage/mail/MQTT/PITR tests. The staging Compose file is parsed statically when Docker CLI is available.
- Physical meter, gateway, radio/network, and vendor hardware validation.
- Production performance and failover measurements.

## Acceptance inventory

- **PARTIALLY_VERIFIED** — Multi-tenancy, roles, user grants and tenant isolation
- **PARTIALLY_VERIFIED** — Authentication, sessions and MFA
- **PARTIALLY_VERIFIED** — Electricity, water, gas and heat metering
- **PARTIALLY_VERIFIED** — Readings, historical data, units and aggregations
- **PARTIALLY_VERIFIED** — Meter replacement and tariff/cost paths
- **PARTIALLY_VERIFIED; HARDWARE_VALIDATION_PENDING** — MODBUS_RTU / MODBUS_TCP software paths
- **PARTIALLY_VERIFIED; HARDWARE_VALIDATION_PENDING** — MBUS / WMBUS / PULSE / LORAWAN adapters and simulations
- **PARTIALLY_VERIFIED** — REST ingestion and MQTT gateway ingestion
- **EXTERNAL_VALIDATION_PENDING** — VENDOR_API providers
- **PARTIALLY_VERIFIED** — Device profiles, gateway heartbeat and health
- **PARTIALLY_VERIFIED** — Edge store-and-forward, replay and idempotency
- **PARTIALLY_VERIFIED** — Dashboards, analytics, forecasts and anomalies
- **PARTIALLY_VERIFIED** — Alarms, reports and CSV/PDF exports
- **PARTIALLY_VERIFIED** — Rules, conditions, actions, cooldown and deduplication
- **PARTIALLY_VERIFIED** — Scheduled rule checks, retries and lease recovery
- **PARTIALLY_VERIFIED** — WorkOrders, assignments, checklists and technician workflow
- **PARTIALLY_VERIFIED** — Attachments, time/material, commissioning and signatures
- **PARTIALLY_VERIFIED** — Devices, fleet, credentials, diagnostics and lifecycle
- **PARTIALLY_VERIFIED** — Firmware metadata, rollout, maintenance and remote commands
- **PARTIALLY_VERIFIED** — Public API keys, scopes, rotation, limits and tenant binding
- **PARTIALLY_VERIFIED** — Webhook signatures, replay, retry and delivery state
- **PARTIALLY_VERIFIED** — Support, incidents, maintenance mode, queues and worker health
- **PARTIALLY_VERIFIED** — Liveness, readiness, build information and observability
- **VERIFIED for executed regression tests** — Auth/authorization, CSRF, injection, SSRF and privilege regression
- **PARTIALLY_VERIFIED; EXTERNAL_VALIDATION_PENDING for scanner provider** — Upload policy, quarantine and malware scanning
- **PARTIALLY_VERIFIED** — Backup registry, verification, retention and RPO/RTO logic
- **EXTERNAL_VALIDATION_PENDING** — PITR, provider restore and full restore drill
- **PARTIALLY_VERIFIED** — Demo seed/reset/scenarios and environment guards
- **EXTERNAL_VALIDATION_PENDING** — Staging deployment, acceptance and promotion
- **PARTIALLY_VERIFIED** — PWA manifest, offline and reconnect behavior
- **IMPLEMENTED; CI not run for this working tree** — CI workflow and release artifact definitions
- **PARTIALLY_VERIFIED; signing not configured/verified** — SBOM generation and signing preparation
- **VERIFIED for executed checks** — Documentation link/script quality gates
- **VERIFIED for executed checks** — Dependency audit and secret scan
- **NOT_EXECUTED** — Database clean install / upgrade / relational integrity
- **NOT_EXECUTED** — Browser E2E and HTTP/API integration against running app
- **HARDWARE_VALIDATION_PENDING** — Physical meters, gateways and vendor hardware
- **NOT_EXECUTED** — Production performance / failover measurements

## Release blocker assessment

No software release blocker was proven by the executed local checks. This is not a release approval: database-dependent and environment acceptance remains incomplete.

## Findings fixed during this acceptance

- Runtime security configuration now accepts the supported `staging` and `demo` environments; regression tests cover both.
- MQTT transport security follows the explicit Meterwerk environment so an isolated staging broker does not inherit pilot/production TLS requirements solely from `NODE_ENV=production`; production/pilot TLS guards remain covered.
- Staging Compose now uses actual worker entrypoints/images, MQTT and attachment-storage variables, a private persistent attachment volume and an explicit read-only receipt-key file. Static Compose parsing passed; services were not started.

These checks require isolated services, credentials, provider infrastructure, or real hardware and are not implied by the local software checks.
