import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Output locations and rule IDs only. Never print a matching value or source line.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  [
    "provider-token",
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})/,
  ],
  ["meterwerk-secret", /mwk_(?:pub|whsec)_[A-Za-z0-9_-]{43}/],
  [
    "credential-url",
    /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|mqtts?|smtps?):\/\/[^\s:'"/]+:([^\s@'"]+)@/,
  ],
  [
    "literal-secret",
    /(?:password|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["']([^"'\r\n]{12,})["']/i,
  ],
];
const fixture =
  /(?:example|demo|test|fixture|development|local|ci-only|change[-_]?me|replace|placeholder|\$\{|process\.env|randomBytes|\.repeat\(|\.env|^meterwerk$)/i;
const reviewedFixtures = new Map([
  ["tests/security.test.ts", new Set(["JBSWY3DPEHPK3PXP"])],
  [
    "tests/security-integration.ts",
    new Set([
      "New-password-456!",
      "Another-password-789!",
      "Invitation-password-123!",
    ]),
  ],
  ["tests/pilot.test.ts", new Set(["secret"])],
]);
let findings = 0,
  samples = 0;
for (const file of [...new Set(files)]) {
  let content;
  try {
    content = readFileSync(file);
  } catch {
    continue;
  }
  if (
    content.includes(0) ||
    content.length > 2_000_000 ||
    file === "scripts/secret-scan.mjs"
  )
    continue;
  content
    .toString("utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      for (const [rule, pattern] of rules) {
        const match = pattern.exec(line);
        if (!match) continue;
        const candidate = match[1] ?? match[0];
        if (reviewedFixtures.get(file)?.has(candidate)) {
          samples++;
          continue;
        }
        if (
          (rule === "literal-secret" || rule === "credential-url") &&
          fixture.test(candidate)
        ) {
          samples++;
          continue;
        }
        // Generic labels, property keys, TypeScript annotations and config templates are not secrets.
        if (
          rule === "literal-secret" &&
          (/^[A-Z_]+$/.test(candidate) ||
            candidate.includes(" ") ||
            /[<>;{}]/.test(candidate))
        )
          continue;
        console.log(`${file}:${index + 1} [${rule}] REVIEW`);
        findings++;
      }
    });
}
console.log(
  `Secret scan: ${findings} review findings; ${samples} recognizable demo/template values. Scope: tracked and unignored working files, not Git history.`,
);
if (findings) process.exitCode = 1;
