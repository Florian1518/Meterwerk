import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const image = process.env.METERWERK_WORKER_IMAGE;
assert(image, "METERWERK_WORKER_IMAGE is required");
assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(process.env.SEED_DEMO, "true");
assert(process.env.DEMO_PASSWORD);
const database = new URL(process.env.DATABASE_URL);
assert(["127.0.0.1", "localhost"].includes(database.hostname));
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();
const inspection = JSON.parse(docker("image", "inspect", image))[0];
assert.equal(inspection.Config.User, "meterwerk");
assert.deepEqual(inspection.Config.Entrypoint, [
  "node",
  "--conditions=react-server",
]);
assert.equal(
  inspection.Config.Labels["org.opencontainers.image.revision"],
  process.env.GIT_COMMIT_SHA,
);
assert.equal(
  inspection.Config.Labels["org.opencontainers.image.created"],
  process.env.BUILD_TIMESTAMP,
);

const runtimeCheck = `
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
try { await import('tsx'); throw new Error('tsx present in worker runtime'); }
catch (error) { assert.equal(error.code, 'ERR_MODULE_NOT_FOUND'); }
assert.deepEqual(readdirSync('/app').sort(), ['dist', 'node_modules', 'package.json', 'src']);
for (const file of ['/app/.env', '/app/.env.production', '/app/.git', '/app/.local/receipt-private.pem', '/app/tests', '/app/scripts']) assert(!existsSync(file), file + ' excluded');
function files(path) { return readdirSync(path).flatMap(name => { const child=resolve(path,name); return statSync(child).isDirectory() ? files(child) : [child]; }); }
assert(!files('/app/dist').some(file => file.endsWith('.map')));
const argon = await import('@node-rs/argon2');
const hash = await argon.hash('synthetic-worker-runtime-smoke', { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
assert(await argon.verify(hash, 'synthetic-worker-runtime-smoke'));
console.log('production dependencies only; native Argon2 hash/verify passed');
`;
docker(
  "run",
  "--rm",
  "--entrypoint",
  "node",
  image,
  "--input-type=module",
  "-e",
  runtimeCheck,
);

const temporary = mkdtempSync(join(tmpdir(), "meterwerk-worker-image-smoke-"));
const receiptKey = join(temporary, "receipt.key");
writeFileSync(receiptKey, randomBytes(32));
chmodSync(receiptKey, 0o444);
const workers = ["rules-worker", "rollout-worker", "mqtt-worker"];
const reports = [];
const names = [];
try {
  for (const worker of workers) {
    const name = `meterwerk-${worker}-${process.pid}`;
    names.push(name);
    const args = [
      "run",
      "--detach",
      "--network",
      "host",
      "--name",
      name,
      "-e",
      `DATABASE_URL=${process.env.DATABASE_URL}`,
      "-e",
      "APP_URL=http://127.0.0.1:3000",
      "-e",
      "METERWERK_ENV=test",
      "-e",
      "NODE_ENV=production",
      "-e",
      "SESSION_SECRET=ci-only-synthetic-session-secret",
      "-e",
      "SEED_DEMO=true",
      "-e",
      `DEMO_PASSWORD=${process.env.DEMO_PASSWORD}`,
      "-e",
      "MQTT_BROKER_URL=mqtt://127.0.0.1:1883",
      "-e",
      "MQTT_RECEIPT_KEY_PATH=/run/secrets/mqtt-receipt-key",
      "-v",
      `${receiptKey}:/run/secrets/mqtt-receipt-key:ro`,
      image,
      `dist/${worker}.js`,
    ];
    const containerId = docker(...args);
    await delay(5000);
    const state = JSON.parse(
      docker("inspect", "--format", "{{json .State}}", containerId),
    );
    assert.equal(
      state.Running,
      true,
      `${worker} remains running after startup`,
    );
    const startupLog = docker("logs", containerId);
    if (worker === "mqtt-worker")
      assert.match(
        startupLog,
        /mqtt\.subscribed/,
        "MQTT worker subscribed to local broker",
      );
    else assert.match(startupLog, new RegExp(`${worker} started`));
    docker("stop", "--time", "35", containerId);
    const exitedLog = docker("logs", name);
    assert.match(
      exitedLog,
      /worker\.stopped/,
      `${worker} shut down gracefully`,
    );
    const imageInfo = {
      name: worker,
      containerId,
      stopped: true,
      gracefulShutdown: true,
    };
    reports.push(imageInfo);
    console.log(`${worker}: started, running and gracefully stopped`);
  }
} finally {
  for (const name of names)
    try {
      execFileSync("docker", ["rm", "--force", name], { stdio: "ignore" });
    } catch {}
  rmSync(temporary, { recursive: true, force: true });
}

const report = {
  status: "PASSED",
  imageId: inspection.Id,
  repoDigests: inspection.RepoDigests,
  sizeBytes: inspection.Size,
  runtimeUser: inspection.Config.User,
  entrypoint: inspection.Config.Entrypoint,
  argon2RuntimeSmoke: "PASSED",
  tsxInRuntime: false,
  workers: reports,
};
mkdirSync(".local/acceptance", { recursive: true });
writeFileSync(
  ".local/acceptance/worker-image-runtime.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
