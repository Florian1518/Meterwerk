import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertWorkerRuntime,
  inspectWorkerRuntime,
  sha256,
} from "./worker-runtime-policy.mjs";

export async function deployWorkerRuntime(outputPath) {
  const base = process.cwd();
  const output = resolve(outputPath);
  assert(!existsSync(output), "Deployment destination must be fresh");
  assert(
    output !== base && !base.startsWith(output + "/"),
    "Deployment must not overwrite source",
  );
  const require = createRequire(import.meta.url);
  // Reuse the tracer already locked and used by the Next standalone deployment.
  const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");
  const workerManifest = JSON.parse(
    readFileSync("dist/worker-manifest.json", "utf8"),
  );
  const entries = Object.keys(workerManifest.workers).map(
    (name) => `dist/${name}`,
  );
  const { fileList, warnings } = await nodeFileTrace(entries, {
    base,
    conditions: ["node", "react-server"],
    exportsOnly: true,
  });
  const optionalWarnings = [];
  for (const warning of warnings) {
    const message = warning.message;
    const dependency = message.match(
      /^Failed to resolve dependency "([^"]+)"/,
    )?.[1];
    const argonAlternative =
      /\/node_modules\/@node-rs\/argon2\/index\.js$/.test(message) &&
      /^(?:\.\/argon2\.[\w-]+\.node|\.\/argon2\.wasi\.cjs|@node-rs\/argon2-[\w-]+(?:\/package\.json)?)$/.test(
        dependency ?? "",
      );
    const optionalDriver =
      dependency === "pg-native" &&
      /\/pg\/lib\/native\/client\.js$/.test(message);
    const optionalWs =
      ["bufferutil", "utf-8-validate"].includes(dependency) &&
      /\/ws\/lib\/(?:buffer-util|validation)\.js$/.test(message);
    assert(
      argonAlternative || optionalDriver || optionalWs,
      `Unreviewed runtime trace warning: ${message}`,
    );
    optionalWarnings.push({
      dependency,
      reason: argonAlternative
        ? "platform alternative; selected native binding verified below"
        : "optional acceleration/native alternative; JS implementation retained",
    });
  }
  const argon = require("@node-rs/argon2");
  const hashed = await argon.hash("synthetic-deployment-native-check");
  assert(await argon.verify(hashed, "synthetic-deployment-native-check"));
  const selected = new Set([...fileList, "dist/worker-manifest.json"]);
  // Preserve legal notices alongside traced code; do not edit third-party files.
  for (const file of fileList) {
    if (!file.startsWith("node_modules/") || !file.endsWith("/package.json"))
      continue;
    const dir = dirname(file);
    for (const name of readdirSync(dir))
      if (
        /^(?:licen[cs]e|copying|notice)(?:\.|$)/i.test(name) &&
        lstatSync(resolve(dir, name)).isFile()
      )
        selected.add(`${dir}/${name}`);
  }
  selected.delete("package.json");
  mkdirSync(output, { recursive: true });
  const files = {};
  for (const file of [...selected].sort()) {
    assert(
      file.startsWith("node_modules/") || file.startsWith("dist/"),
      `Unexpected traced project file: ${file}`,
    );
    const source = resolve(base, file),
      target = resolve(output, file);
    assert(!relative(output, target).startsWith(".."));
    mkdirSync(dirname(target), { recursive: true });
    if (lstatSync(source).isSymbolicLink()) {
      const link = readlinkSync(source);
      assert(
        !relative(base, resolve(dirname(source), link)).startsWith(".."),
        "Source symlink escapes workspace",
      );
      symlinkSync(link, target);
      files[file] = { symlink: link };
    } else {
      copyFileSync(source, target);
      files[file] = { sha256: sha256(readFileSync(source)) };
    }
  }
  const sourcePackage = JSON.parse(readFileSync("package.json", "utf8"));
  const runtimePackage = {
    name: "meterwerk-worker",
    version: sourcePackage.version,
    private: true,
    type: "module",
  };
  writeFileSync(
    resolve(output, "package.json"),
    JSON.stringify(runtimePackage, null, 2) + "\n",
  );
  files["package.json"] = {
    sha256: sha256(readFileSync(resolve(output, "package.json"))),
  };
  const manifest = {
    schemaVersion: 1,
    strategy: "locked-pnpm-install + node-file-trace deployment",
    commit: workerManifest.commit,
    workingTree: workerManifest.workingTree,
    builtAt: workerManifest.builtAt,
    lockfileSha256: workerManifest.lockfileSha256,
    platform: `${process.platform}-${process.arch}`,
    tracer: `next@${require("next/package.json").version}/compiled/@vercel/nft`,
    optionalWarnings,
    files,
  };
  writeFileSync(
    resolve(output, "runtime-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const inspection = inspectWorkerRuntime(output);
  assertWorkerRuntime(inspection);
  // Resolve every external from the deployed tree, never from the build workspace.
  const externals = [
    ...new Set(
      Object.values(workerManifest.workers).flatMap(
        (worker) => worker.externalImports,
      ),
    ),
  ];
  execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import {existsSync} from 'node:fs';
    import {fileURLToPath} from 'node:url';
    import {relative} from 'node:path';
    for(const name of ${JSON.stringify(externals)}) {
      const found=fileURLToPath(import.meta.resolve(name));
      assert(existsSync(found), 'Missing ESM external: '+name);
      assert(!relative(process.cwd(),found).startsWith('..'), 'External escaped deployment: '+name);
    }
  `,
    ],
    { cwd: output, stdio: "pipe" },
  );
  console.log(
    `Worker deployment: ${inspection.productionPackages} runtime packages, ${inspection.files.length} files, ${inspection.devOnlyPackages.length} dev-only packages, ${inspection.dependencyFixtures.length} dependency fixtures`,
  );
  return manifest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await deployWorkerRuntime(process.argv[2] ?? "worker-runtime");
