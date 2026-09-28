import { execFileSync } from "node:child_process";
const env = process.env.METERWERK_ENV ?? "";
if (
  !["demo", "test"].includes(env) ||
  process.env.DEMO_RESET_CONFIRM !== "I_UNDERSTAND_DEMO_RESET"
)
  throw new Error(
    "Demo reset requires METERWERK_ENV=demo|test and explicit DEMO_RESET_CONFIRM",
  );
if (
  !process.env.DATABASE_URL ||
  /prod|production|live/i.test(process.env.DATABASE_URL)
)
  throw new Error("Refusing unknown or production-like database");
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "reset", "--force"],
  { stdio: "inherit", env: { ...process.env, METERWERK_ENV: env } },
);
execFileSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, SEED_DEMO: "true", METERWERK_ENV: env },
  },
);
