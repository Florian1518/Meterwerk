import { execFileSync } from "node:child_process";
const env = process.env.METERWERK_ENV ?? "";
if (!["demo", "test"].includes(env))
  throw new Error("demo:verify-all requires METERWERK_ENV=demo or test");
execFileSync("node", ["scripts/environment-guard.mjs"], {
  stdio: "inherit",
  env: process.env,
});
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required; no demo database was verified");
execFileSync("pnpm", ["demo:verify"], { stdio: "inherit", env: process.env });
if (process.env.SMOKE_BASE_URL)
  execFileSync("pnpm", ["smoke:staging"], {
    stdio: "inherit",
    env: process.env,
  });
console.log(
  "Demo verification completed; scenario/unit checks are executed by the test suite.",
);
