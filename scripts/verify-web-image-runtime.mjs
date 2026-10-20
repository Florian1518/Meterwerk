import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const image = process.env.METERWERK_WEB_IMAGE;
assert(image, "METERWERK_WEB_IMAGE is required");
assert.equal(process.env.METERWERK_ENV, "test");
assert.equal(process.env.SEED_DEMO, "true");
assert(process.env.DEMO_PASSWORD);
const database = new URL(process.env.DATABASE_URL);
assert(["127.0.0.1", "localhost"].includes(database.hostname));
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();
const inspection = JSON.parse(docker("image", "inspect", image))[0];
assert.equal(inspection.Config.User, "meterwerk");
assert.deepEqual(inspection.Config.Entrypoint, ["node"]);
assert.deepEqual(inspection.Config.Cmd, ["server.js"]);
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
import { existsSync } from 'node:fs';
try { await import('tsx'); throw new Error('tsx present in web runtime'); }
catch (error) { assert.equal(error.code, 'ERR_MODULE_NOT_FOUND'); }
for (const file of ['/app/.env', '/app/.env.production', '/app/.git', '/app/.local/receipt-private.pem', '/app/tests', '/app/test-results']) assert(!existsSync(file), file + ' excluded');
const argon = await import('@node-rs/argon2');
const hash = await argon.hash('synthetic-web-image-smoke', { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
assert(await argon.verify(hash, 'synthetic-web-image-smoke'));
console.log('web runtime has no tsx; native Argon2 hash/verify passed');
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

const name = `meterwerk-web-image-${process.pid}`;
let containerId;
try {
  containerId = docker(
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
    "NEXT_PUBLIC_METERWERK_ENV=test",
    "-e",
    "NODE_ENV=production",
    "-e",
    "SESSION_SECRET=ci-only-synthetic-session-secret",
    "-e",
    "MFA_ENCRYPTION_KEY=ci-only-synthetic-mfa-key-32-bytes",
    "-e",
    "WEBHOOK_SECRET_ENCRYPTION_KEY=ci-only-synthetic-mfa-key-32-bytes",
    "-e",
    "SEED_DEMO=true",
    "-e",
    `DEMO_PASSWORD=${process.env.DEMO_PASSWORD}`,
    "-e",
    "EMAIL_PROVIDER=local",
    "-e",
    "ATTACHMENT_STORAGE=local",
    "-e",
    "ATTACHMENT_LOCAL_ROOT=/app/.local/attachments",
    image,
  );
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt++) {
    const state = JSON.parse(
      docker("inspect", "--format", "{{json .State}}", containerId),
    );
    assert.equal(
      state.Running,
      true,
      "Web image remains running during startup",
    );
    try {
      ready =
        (
          await fetch("http://127.0.0.1:3000/api/health/ready", {
            signal: AbortSignal.timeout(1500),
          })
        ).status === 200;
    } catch {
      await delay(500);
    }
  }
  assert(ready, "Web image readiness endpoint passed");
  execFileSync(
    process.execPath,
    ["scripts/verify-release-runtime.mjs", "http://127.0.0.1:3000"],
    { stdio: "inherit", env: process.env },
  );
  const stopped = docker("stop", "--time", "15", containerId);
  const report = {
    status: "PASSED",
    imageId: inspection.Id,
    repoDigests: inspection.RepoDigests,
    sizeBytes: inspection.Size,
    runtimeUser: inspection.Config.User,
    baseImage: "node:22-alpine",
    runtimeTsx: false,
    nativeArgon2: "PASSED",
    smoke: [
      "liveness",
      "readiness",
      "synthetic login",
      "authenticated dashboard",
    ],
    stopped,
  };
  mkdirSync(".local/acceptance", { recursive: true });
  writeFileSync(
    ".local/acceptance/web-image-runtime.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (containerId)
    try {
      execFileSync("docker", ["rm", "--force", name], { stdio: "ignore" });
    } catch {}
}

const productionName = `meterwerk-web-production-health-${process.pid}`;
let productionContainerId;
try {
  productionContainerId = docker(
    "run",
    "--detach",
    "--network",
    "host",
    "--name",
    productionName,
    "-e",
    `DATABASE_URL=${process.env.DATABASE_URL}`,
    "-e",
    "APP_URL=https://localhost:3000",
    "-e",
    "TRUSTED_HOSTS=localhost,127.0.0.1",
    "-e",
    "METERWERK_ENV=production",
    "-e",
    "NEXT_PUBLIC_METERWERK_ENV=production",
    "-e",
    "NODE_ENV=production",
    "-e",
    "SESSION_SECRET=ci-only-synthetic-session-secret-32-bytes",
    "-e",
    "MFA_ENCRYPTION_KEY=ci-only-synthetic-mfa-encryption-key-32-bytes",
    "-e",
    "EMAIL_PROVIDER=local",
    image,
  );

  const headers = {
    "x-forwarded-proto": "https",
    "x-forwarded-host": "localhost",
  };
  let ready = false;
  for (let attempt = 0; attempt < 120 && !ready; attempt++) {
    const state = JSON.parse(
      docker("inspect", "--format", "{{json .State}}", productionContainerId),
    );
    assert.equal(state.Running, true, "Production web image remains running");
    try {
      ready =
        (
          await fetch("http://127.0.0.1:3000/api/health/ready", {
            headers,
            signal: AbortSignal.timeout(1500),
          })
        ).status === 200;
    } catch {
      await delay(500);
    }
  }
  assert(ready, "Production readiness works with trusted TLS proxy headers");

  const buildInfoResponse = await fetch(
    "http://127.0.0.1:3000/api/system/build-info",
    { headers },
  );
  assert.equal(buildInfoResponse.status, 200);
  const buildInfo = await buildInfoResponse.json();
  assert.equal(
    buildInfo.version,
    inspection.Config.Labels["org.opencontainers.image.version"],
  );
  assert.equal(
    buildInfo.commit,
    inspection.Config.Labels["org.opencontainers.image.revision"],
  );

  const redirect = await fetch("http://127.0.0.1:3000/login", {
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": "localhost",
      "x-forwarded-proto": "http",
    },
    redirect: "manual",
  });
  assert.equal(redirect.status, 308, "Plain HTTP still redirects to HTTPS");
  assert.match(redirect.headers.get("location") ?? "", /^https:\/\//);

  const untrustedHost = await fetch("http://127.0.0.1:3000/api/health/ready", {
    headers: {
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    },
    redirect: "manual",
  });
  assert.equal(untrustedHost.status, 421, "Untrusted hosts remain rejected");

  let containerState;
  for (let attempt = 0; attempt < 90; attempt++) {
    containerState = JSON.parse(
      docker("inspect", "--format", "{{json .State}}", productionContainerId),
    );
    if (containerState.Health?.Status === "healthy") break;
    await delay(1000);
  }
  assert.equal(containerState.Health?.Status, "healthy");
  assert.equal(containerState.RestartCount, 0);
  console.log(
    "Production web image: readiness, Docker health, build metadata, HTTPS redirect and host rejection passed",
  );
} finally {
  if (productionContainerId)
    try {
      execFileSync("docker", ["rm", "--force", productionName], {
        stdio: "ignore",
      });
    } catch {}
}
