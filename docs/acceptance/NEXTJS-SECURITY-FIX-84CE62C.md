# Next.js Security Fix Evidence

**Basis:** `master` at `84ce62c5c48011bb0354b556ddb77c4abc20c438`  
**Assessment:** local worktree based on that commit; dependency patch only  
**Outcome:** dependency audit and build/static gates pass; local container runtime smoke is incomplete because the available test database is not reachable through the verifier's loopback setup.

## Change

- Direct dependency `next` pinned to `16.3.8`.
- Direct dependency `eslint-config-next` pinned consistently to `16.3.8`.
- Lockfile regenerated with pnpm `12.5.1`; no other dependency versions changed.
- Source search in `src/` and `apps/` found no `next/og` or `ImageResponse` usage. React SVG components exist, but no request-driven `ImageResponse` SVG path was found. This records source findings only and does not claim the advisory was exploitable in Meterwerk.

## Dependency and source gates

| Gate                                       | Result                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`           | PASSED                                                                                                                                            |
| Prisma generate                            | PASSED                                                                                                                                            |
| Prisma validate                            | PASSED                                                                                                                                            |
| `pnpm audit --audit-level high`            | PASSED, exit 0                                                                                                                                    |
| `pnpm audit --json`                        | PASSED, exit 0; 0 critical, 0 high, 0 moderate, 0 low; 0 advisories                                                                               |
| Lockfile SHA-256                           | `321fe1b02bc6508a33a63d4df0609da5ee6d08ec8f05d1c5dcef6ff9a42da530`                                                                                |
| Typecheck / ESLint / Prettier              | PASSED                                                                                                                                            |
| Unit tests                                 | 285/285 PASSED                                                                                                                                    |
| Security regression                        | 63/63 PASSED                                                                                                                                      |
| Production Web build                       | PASSED; Next.js 16.3.8                                                                                                                            |
| Worker bundle build / static verification  | PASSED; 3 bundles, 0 source maps, traced deployment; 55 runtime packages, 0 dev-only packages                                                     |
| Image/static, docs, secret, artifact tests | PASSED; image-policy tests 16/16; docs quality and artifact/evidence checks passed; secret scan 0 review findings (18 known template/demo values) |
| `git diff --check`                         | PASSED                                                                                                                                            |

## Local container builds

Both images were built for `linux/amd64` from the patched worktree. The revision label is explicitly suffixed `-next1638-local` because package manifests and lockfile are uncommitted changes atop the RC commit; these images do not claim to be artifacts of the unmodified commit SHA. Base image was `node:22-alpine`, resolved during build to `sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`.

| Image                                | ID / local RepoDigest                                                     |              Size | Build timestamp        |
| ------------------------------------ | ------------------------------------------------------------------------- | ----------------: | ---------------------- |
| `meterwerk-web:next-16.3.8-local`    | `sha256:ae052d1722487b4afe5eff80a03fc3ae51ce3b54f11f90c63aebf44efd77fdb4` | 327,953,247 bytes | `2026-10-02T08:04:22Z` |
| `meterwerk-worker:next-16.3.8-local` | `sha256:8f5bd2c4837e5bfc0a1b1dd1f625bd40ef9c76a69b5cc927ab2e672b17604513` | 253,616,411 bytes | `2026-10-02T08:04:22Z` |

Worker image content verification passed: user `meterwerk`, workdir `/app`, expected Node entrypoint, 55 production packages, no dev-only packages, project tests, fixtures, secret files or secret patterns; native Argon2 passed and all three bundle hashes/imports verified.

## Runtime-smoke limitation

- Web image build passed. `verify-web-image-runtime.mjs` did not reach readiness and therefore did not complete login/API/drain checks.
- Worker image content verification passed. The three workers started and stopped with exit code 0 and graceful-shutdown assertions passed; however, Rules and Rollout logged `PrismaClientKnownRequestError` during cycles. The verifier's available loopback database was the unrelated `smart-metering` Compose database; the acceptance database named by the preserved environment file is on a private Docker network without a host port. MQTT worker subscribed successfully.
- These are **not recorded as full runtime acceptance passes**. The impacted container runtime acceptance remains pending a correctly wired synthetic acceptance database/runtime network.
- Docker CLI on this machine has no `docker sbom` subcommand. No new image SBOM is claimed by this evidence.

No product behavior was changed. No hardware, production resources, customer data, push, tag, deployment, or commit was used.
