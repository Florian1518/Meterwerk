import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const image = process.env.METERWERK_WORKER_IMAGE;
assert(image, "METERWERK_WORKER_IMAGE required");
const policy = readFileSync("scripts/worker-runtime-policy.mjs").toString(
  "base64",
);
const code = `
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const {verifyWorkerDeployment}=await import('data:text/javascript;base64,${policy}');
const report=verifyWorkerDeployment('/app');
for(const path of ['/usr/local/bin/npm','/usr/local/bin/npx','/usr/local/bin/corepack','/usr/local/bin/yarn']) assert(!existsSync(path),'Unnecessary runtime package manager: '+path);
const require=createRequire('/app/package.json');
for(const worker of Object.values(report.workers.workers))for(const name of worker.externalImports)assert(existsSync(fileURLToPath(import.meta.resolve(name))), 'Missing ESM external: '+name);
for(const name of ['tsx','typescript','prisma','@playwright/test','playwright','vitest']) {
  assert.throws(()=>require.resolve(name),{code:'MODULE_NOT_FOUND'});
}
const argon=require('@node-rs/argon2');const hash=await argon.hash('synthetic-native-acceptance');assert(await argon.verify(hash,'synthetic-native-acceptance'));
console.log(JSON.stringify({status:'PASSED',productionPackages:report.productionPackages,packages:report.packages,devOnlyPackages:report.devOnlyPackages,projectTests:report.projectTests,dependencyFixtures:report.dependencyFixtures,secretFiles:report.secretFiles,secretPatterns:report.secretPatterns,files:report.files.length,symlinks:report.symlinks.length,commit:report.manifest.commit,workingTree:report.manifest.workingTree,builtAt:report.manifest.builtAt,lockfileSha256:report.manifest.lockfileSha256,argon2Native:'PASSED',bundleHashes:'3/3',externalImports:'all resolved'}));`;
const raw = execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "--network",
    "none",
    "--entrypoint",
    "node",
    image,
    "--conditions=react-server",
    "--input-type=module",
    "-e",
    code,
  ],
  { encoding: "utf8" },
);
const inspection = JSON.parse(
  execFileSync("docker", ["image", "inspect", image], { encoding: "utf8" }),
)[0];
assert.equal(inspection.Config.User, "meterwerk");
assert.equal(inspection.Config.WorkingDir, "/app");
assert.deepEqual(inspection.Config.Entrypoint, [
  "node",
  "--conditions=react-server",
]);
assert.deepEqual(inspection.Config.Cmd, ["dist/rules-worker.js"]);
const report = {
  ...JSON.parse(raw),
  image,
  imageId: inspection.Id,
  repoDigests: inspection.RepoDigests,
  sizeBytes: inspection.Size,
  architecture: inspection.Architecture,
  os: inspection.Os,
  labels: inspection.Config.Labels,
};
assert.equal(
  report.commit,
  inspection.Config.Labels["org.opencontainers.image.revision"],
);
mkdirSync(".local/acceptance", { recursive: true });
writeFileSync(
  ".local/acceptance/worker-image-content.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ ...report, packages: undefined }, null, 2));
