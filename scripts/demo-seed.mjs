import { execFileSync } from "node:child_process";
const env = process.env.METERWERK_ENV ?? "demo";
if (!["demo", "test", "development"].includes(env))
  throw new Error("Demo seed is only allowed in development, test or demo");
execFileSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, METERWERK_ENV: env, SEED_DEMO: "true" },
  },
);
