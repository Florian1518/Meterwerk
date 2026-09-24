import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const version = process.env.RELEASE_VERSION ?? "0.1.0";
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const output = resolve("release-artifacts", version);
mkdirSync(output, { recursive: true });
writeFileSync(
  resolve(output, "metadata.json"),
  JSON.stringify(
    {
      version,
      commit,
      builtAt: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "production",
    },
    null,
    2,
  ),
);
execFileSync("node", ["node_modules/prisma/build/index.js", "generate"], {
  stdio: "inherit",
});
console.log(`Release metadata written to ${output}`);
