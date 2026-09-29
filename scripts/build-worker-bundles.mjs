import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function buildWorkerBundles(outputPath) {
  const output = resolve(outputPath);
  const require = createRequire(realpathSync("node_modules/tsx/package.json"));
  const esbuild = require("esbuild");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const entries = [
    "src/server/rules-worker.ts",
    "src/server/mqtt-worker.ts",
    "src/server/rollout-worker.ts",
  ];

  mkdirSync(output, { recursive: true });
  const result = await esbuild.build({
    entryPoints: entries,
    outdir: output,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    alias: { "next/headers": "next/headers.js" },
    sourcemap: false,
    metafile: true,
  });
  const workers = {};
  for (const entry of entries) {
    const name = basename(entry, ".ts");
    const outputMeta = Object.values(result.metafile.outputs).find((item) =>
      item.entryPoint?.replaceAll("\\", "/").endsWith(entry),
    );
    if (!outputMeta) throw new Error(`Missing bundle output for ${entry}`);
    const file = resolve(output, `${name}.js`);
    workers[`${name}.js`] = {
      sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
      externalImports: [
        ...new Set(
          outputMeta.imports
            .filter((item) => item.external)
            .map((item) => item.path)
            .filter((item) => !item.startsWith("node:")),
        ),
      ].sort(),
    };
  }

  let workingTree = process.env.GIT_WORKING_TREE ?? "unknown";
  if (!process.env.GIT_WORKING_TREE) {
    try {
      workingTree = execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim()
        ? "dirty"
        : "clean";
    } catch {
      workingTree = "not-present-in-build-context";
    }
  }
  const manifest = {
    schemaVersion: 1,
    packageVersion: pkg.version,
    commit:
      process.env.GIT_COMMIT_SHA ??
      execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    workingTree,
    builtAt: process.env.BUILD_TIMESTAMP ?? new Date().toISOString(),
    lockfileSha256: createHash("sha256")
      .update(readFileSync("pnpm-lock.yaml"))
      .digest("hex"),
    target: "node22-linux-alpine",
    hostPlatform: `${process.platform}-${process.arch}`,
    workers,
  };
  writeFileSync(
    resolve(output, "worker-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    `Built ${Object.keys(workers).length} worker bundles in ${output}`,
  );
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await buildWorkerBundles(process.argv[2] ?? "release-artifacts/0.1.0/worker");
