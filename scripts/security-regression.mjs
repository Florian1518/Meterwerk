import { spawnSync } from "node:child_process";
const tests = [
  "tests/security.test.ts",
  "tests/security-hardening.test.ts",
  "tests/security-regression.test.ts",
  "tests/security-part2.test.ts",
  "tests/security-part2-access.test.ts",
  "tests/security-outbound.test.ts",
];
const result = spawnSync(
  "corepack",
  ["pnpm", "exec", "vitest", "run", ...tests],
  { stdio: "inherit", shell: true, env: process.env },
);
process.exit(result.status ?? 1);
