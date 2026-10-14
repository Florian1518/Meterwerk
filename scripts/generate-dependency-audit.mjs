import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const lockfileSha256 = sha256(readFileSync("pnpm-lock.yaml"));
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const pnpm = (args) =>
  execFileSync(
    process.platform === "win32" ? "cmd.exe" : "pnpm",
    process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", ...args] : args,
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
const toolVersion = pnpm(["--version"]).trim();
// A failed command or invalid response must never produce a passing record.
const raw = pnpm(["audit", "--audit-level", "high", "--json"]);
const audit = JSON.parse(raw);
const severities = ["info", "low", "moderate", "high", "critical"];
if (
  audit.error ||
  !audit.advisories ||
  typeof audit.advisories !== "object" ||
  Array.isArray(audit.advisories) ||
  Object.keys(audit.advisories).length !== 0 ||
  severities.some(
    (severity) =>
      !Number.isSafeInteger(audit.metadata?.vulnerabilities?.[severity]) ||
      audit.metadata.vulnerabilities[severity] < 0,
  )
)
  throw new Error(
    "Dependency audit must report no advisories rejected by the CI audit policy",
  );
if (sha256(readFileSync("pnpm-lock.yaml")) !== lockfileSha256)
  throw new Error("Lockfile changed during dependency audit");

writeFileSync(
  "docs/acceptance/DEPENDENCY-AUDIT-4932F00.json",
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      gitSha,
      tool: { name: "pnpm", version: toolVersion },
      lockfile: { file: "pnpm-lock.yaml", sha256: lockfileSha256 },
      command: "pnpm audit --audit-level high --json",
      exitCode: 0,
      status: "PASSED",
      // pnpm filters advisories by auditConfig and --audit-level. In 12.5.1,
      // metadata counts can still include ignored or below-threshold findings.
      // Record policy-blocking findings here; retain the raw report below.
      advisories: Object.fromEntries(
        severities.map((severity) => [
          severity,
          Object.values(audit.advisories).filter(
            (advisory) => advisory.severity === severity,
          ).length,
        ]),
      ),
      rawPnpmJson: audit,
      rawOutputSha256: sha256(raw),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Fresh dependency audit provenance written for the current lockfile",
);
