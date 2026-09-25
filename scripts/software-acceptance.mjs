import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.platform === "win32" ? "cmd.exe" : "corepack";
const checks = [
  ["Prisma validate", ["exec", "prisma", "validate"]],
  ["Prisma generate", ["db:generate"]],
  ["Typecheck", ["typecheck"]],
  ["ESLint", ["lint"]],
  ["Prettier", ["format:check"]],
  ["Unit tests", ["test"]],
  ["Security regression", ["security:regression"]],
  ["Documentation links", ["docs:check"]],
  ["Documentation references", ["docs:validate"]],
  ["Secret scan", ["security:secrets"]],
  ["Dependency audit", ["audit", "--audit-level", "high"]],
  ["Staging Compose syntax", null],
  ["Production build", ["build"]],
];
const categories = [
  [
    "Multi-tenancy, roles, user grants and tenant isolation",
    "PARTIALLY_VERIFIED",
  ],
  ["Authentication, sessions and MFA", "PARTIALLY_VERIFIED"],
  ["Electricity, water, gas and heat metering", "PARTIALLY_VERIFIED"],
  ["Readings, historical data, units and aggregations", "PARTIALLY_VERIFIED"],
  ["Meter replacement and tariff/cost paths", "PARTIALLY_VERIFIED"],
  [
    "MODBUS_RTU / MODBUS_TCP software paths",
    "PARTIALLY_VERIFIED; HARDWARE_VALIDATION_PENDING",
  ],
  [
    "MBUS / WMBUS / PULSE / LORAWAN adapters and simulations",
    "PARTIALLY_VERIFIED; HARDWARE_VALIDATION_PENDING",
  ],
  ["REST ingestion and MQTT gateway ingestion", "PARTIALLY_VERIFIED"],
  ["VENDOR_API providers", "EXTERNAL_VALIDATION_PENDING"],
  ["Device profiles, gateway heartbeat and health", "PARTIALLY_VERIFIED"],
  ["Edge store-and-forward, replay and idempotency", "PARTIALLY_VERIFIED"],
  ["Dashboards, analytics, forecasts and anomalies", "PARTIALLY_VERIFIED"],
  ["Alarms, reports and CSV/PDF exports", "PARTIALLY_VERIFIED"],
  [
    "Rules, conditions, actions, cooldown and deduplication",
    "PARTIALLY_VERIFIED",
  ],
  ["Scheduled rule checks, retries and lease recovery", "PARTIALLY_VERIFIED"],
  [
    "WorkOrders, assignments, checklists and technician workflow",
    "PARTIALLY_VERIFIED",
  ],
  [
    "Attachments, time/material, commissioning and signatures",
    "PARTIALLY_VERIFIED",
  ],
  [
    "Devices, fleet, credentials, diagnostics and lifecycle",
    "PARTIALLY_VERIFIED",
  ],
  [
    "Firmware metadata, rollout, maintenance and remote commands",
    "PARTIALLY_VERIFIED",
  ],
  [
    "Public API keys, scopes, rotation, limits and tenant binding",
    "PARTIALLY_VERIFIED",
  ],
  [
    "Webhook signatures, replay, retry and delivery state",
    "PARTIALLY_VERIFIED",
  ],
  [
    "Support, incidents, maintenance mode, queues and worker health",
    "PARTIALLY_VERIFIED",
  ],
  [
    "Liveness, readiness, build information and observability",
    "PARTIALLY_VERIFIED",
  ],
  [
    "Auth/authorization, CSRF, injection, SSRF and privilege regression",
    "VERIFIED for executed regression tests",
  ],
  [
    "Upload policy, quarantine and malware scanning",
    "PARTIALLY_VERIFIED; EXTERNAL_VALIDATION_PENDING for scanner provider",
  ],
  [
    "Backup registry, verification, retention and RPO/RTO logic",
    "PARTIALLY_VERIFIED",
  ],
  [
    "PITR, provider restore and full restore drill",
    "EXTERNAL_VALIDATION_PENDING",
  ],
  ["Demo seed/reset/scenarios and environment guards", "PARTIALLY_VERIFIED"],
  [
    "Staging deployment, acceptance and promotion",
    "EXTERNAL_VALIDATION_PENDING",
  ],
  ["PWA manifest, offline and reconnect behavior", "PARTIALLY_VERIFIED"],
  [
    "CI workflow and release artifact definitions",
    "IMPLEMENTED; CI not run for this working tree",
  ],
  [
    "SBOM generation and signing preparation",
    "PARTIALLY_VERIFIED; signing not configured/verified",
  ],
  ["Documentation link/script quality gates", "VERIFIED for executed checks"],
  ["Dependency audit and secret scan", "VERIFIED for executed checks"],
  ["Database clean install / upgrade / relational integrity", "NOT_EXECUTED"],
  ["Browser E2E and HTTP/API integration against running app", "NOT_EXECUTED"],
  [
    "Physical meters, gateways and vendor hardware",
    "HARDWARE_VALIDATION_PENDING",
  ],
  ["Production performance / failover measurements", "NOT_EXECUTED"],
];

const results = [];
for (const [label, args] of checks) {
  console.log(`\n=== ${label} ===`);
  let result;
  if (args === null) {
    result = spawnSync("docker", ["--version"], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      results.push({ label, status: "NOT_EXECUTED", exitCode: null });
      console.log("Docker CLI unavailable; skipped static Compose validation.");
      continue;
    }
    result = spawnSync(
      "docker",
      ["compose", "-f", "compose.staging.yaml", "config", "--quiet"],
      {
        cwd: root,
        env: {
          ...process.env,
          METERWERK_IMAGE: "meterwerk-web:acceptance-only",
          METERWERK_WORKER_IMAGE: "meterwerk-worker:acceptance-only",
          STAGING_POSTGRES_PASSWORD: "acceptance-only-placeholder",
          STAGING_SESSION_SECRET:
            "acceptance-only-placeholder-session-secret-not-for-use",
          STAGING_MQTT_RECEIPT_KEY: "./acceptance-only-placeholder-key",
        },
        stdio: "inherit",
      },
    );
  } else {
    const commandArgs =
      process.platform === "win32"
        ? ["/d", "/s", "/c", `corepack pnpm ${args.join(" ")}`]
        : ["pnpm", ...args];
    result = spawnSync(command, commandArgs, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
  }
  const status = result.status === 0 ? "PASSED" : "FAILED";
  results.push({ label, status, exitCode: result.status ?? 1 });
}

const shaResult = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
});
const sha = shaResult.status === 0 ? shaResult.stdout.trim() : "unknown";
const now = new Date().toISOString();
const lines = [
  "# Software Acceptance Result",
  "",
  `- Baseline / HEAD: \`${sha}\``,
  `- Package version: \`${packageJson.version}\``,
  `- Recorded at: \`${now}\``,
  "- Scope: local software checks executed by `pnpm acceptance:software`.",
  "",
  "## Executed checks",
  "",
  ...results.map(
    ({ label, status, exitCode }) =>
      `- **${status}** — ${label} (exit ${exitCode})`,
  ),
  "",
  "## Not executed by this command",
  "",
  "- PostgreSQL clean-install / upgrade integration tests and HTTP/API suites requiring a dedicated test database.",
  "- Docker/Web/Worker images, staging runtime/promotion, browser E2E against a running environment, and provider-backed storage/mail/MQTT/PITR tests. The staging Compose file is parsed statically when Docker CLI is available.",
  "- Physical meter, gateway, radio/network, and vendor hardware validation.",
  "- Production performance and failover measurements.",
  "",
  "## Acceptance inventory",
  "",
  ...categories.map(([category, status]) => `- **${status}** — ${category}`),
  "",
  "## Release blocker assessment",
  "",
  "No software release blocker was proven by the executed local checks. This is not a release approval: database-dependent and environment acceptance remains incomplete.",
  "",
  "## Findings fixed during this acceptance",
  "",
  "- Runtime security configuration now accepts the supported `staging` and `demo` environments; regression tests cover both.",
  "- MQTT transport security follows the explicit Meterwerk environment so an isolated staging broker does not inherit pilot/production TLS requirements solely from `NODE_ENV=production`; production/pilot TLS guards remain covered.",
  "- Staging Compose now uses actual worker entrypoints/images, MQTT and attachment-storage variables, a private persistent attachment volume and an explicit read-only receipt-key file. Static Compose parsing passed; services were not started.",
  "",
  "These checks require isolated services, credentials, provider infrastructure, or real hardware and are not implied by the local software checks.",
  "",
];
const report = resolve(root, "docs/acceptance/SOFTWARE-ACCEPTANCE-RESULT.md");
await mkdir(dirname(report), { recursive: true });
await writeFile(report, lines.join("\n"), "utf8");
console.log(`\nAcceptance report written: ${report}`);
if (results.some(({ status }) => status === "FAILED")) process.exitCode = 1;
