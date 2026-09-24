import { execFileSync } from "node:child_process";
execFileSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "validate"],
  { stdio: "inherit" },
);
if (process.env.DATABASE_URL) {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "status"],
    { stdio: "inherit" },
  );
} else {
  console.log("DATABASE_URL fehlt: Migrationen wurden nur validiert.");
}
