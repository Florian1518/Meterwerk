import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  rmdirSync,
  realpathSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { after, test } from "node:test";
import {
  assertStagingConfig,
  assertStagingImages,
} from "./verify-staging-config.mjs";
import { assertWorkflowSecurity } from "./workflow-security-policy.mjs";

const yaml = createRequire(realpathSync("node_modules/eslint/package.json"))(
  "js-yaml",
);

const root = mkdtempSync(join(tmpdir(), "meterwerk-staging-config-"));
after(() => {
  assert(root.startsWith(resolve(tmpdir()) + sep));
  for (const file of readdirSync(root)) unlinkSync(join(root, file));
  rmdirSync(root);
});
const digest = "a".repeat(64);
const values = {
  STAGING_APP_URL: "https://staging.fesch-elektrotechnik.de",
  STAGING_POSTGRES_PASSWORD: "synthetic-only-database-configuration-fixture",
  STAGING_DATABASE_URL:
    "postgresql://meterwerk_staging:synthetic-only-database-configuration-fixture@db:5432/meterwerk_staging",
  STAGING_SESSION_SECRET: "synthetic-only-session-configuration-fixture",
  MFA_ENCRYPTION_KEY: "synthetic-only-mfa-configuration-fixture",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "synthetic-only-webhook-configuration-fixture",
  RELEASE_VERSION: "0.0.0-staging-config-test",
  GIT_COMMIT_SHA: "b".repeat(40),
  METERWERK_IMAGE: `ghcr.io/florian1518/meterwerk-web@sha256:${digest}`,
  METERWERK_WORKER_IMAGE: `ghcr.io/florian1518/meterwerk-worker@sha256:${digest}`,
  METERWERK_MIGRATIONS_IMAGE: `ghcr.io/florian1518/meterwerk-migrations@sha256:${digest}`,
  STAGING_POSTGRES_IMAGE: `postgres:17-alpine@sha256:${digest}`,
  STAGING_MQTT_IMAGE: `eclipse-mosquitto:2@sha256:${digest}`,
};
for (const key of [
  "CONFIG",
  "ACL",
  "CA",
  "CRL",
  "SERVER_CERT",
  "SERVER_KEY",
  "CLIENT_CERT",
  "CLIENT_KEY",
  "HEALTH_CERT",
  "HEALTH_KEY",
  "RECEIPT_KEY",
]) {
  const file = join(root, key.toLowerCase());
  writeFileSync(
    file,
    key === "CONFIG"
      ? readFileSync("infra/mosquitto/staging.conf")
      : key === "ACL"
        ? readFileSync("infra/mosquitto/staging.acl")
        : "Not a certificate or secret: static configuration test fixture.\n",
  );
  values[`STAGING_MQTT_${key}`] = file;
}
const envFile = join(root, "fixture.env");
writeFileSync(
  envFile,
  "# No actual secrets; all variables supplied by isolated test environment.\n",
);
const composeArgs = [
  "compose",
  "--project-name",
  "meterwerk-staging-config-test",
  "--env-file",
  envFile,
  "-f",
  "compose.staging.yaml",
  "-f",
  "compose.staging.external.yaml",
  "--profile",
  "operations",
  "config",
  "--format",
  "json",
];
function compose(overrides = {}) {
  return JSON.parse(
    execFileSync("docker", composeArgs, {
      encoding: "utf8",
      env: { ...process.env, ...values, ...overrides },
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}

test("actual Compose merge keeps loopback-only Web, private DB/MQTT and mandatory staging settings", () => {
  const config = compose();
  assertStagingConfig(config);
  assert.equal(
    config.services["mqtt-worker"].volumes.filter(
      (v) => v.target === "/run/secrets/mqtt-receipt-key",
    ).length,
    1,
  );
  assert.match(
    config.services.mqtt.healthcheck.test.join(" "),
    /--cert.*--key/,
  );
  assert.doesNotMatch(
    config.services.mqtt.healthcheck.test.join(" "),
    /1883|--insecure/,
  );
});

test("Compose refuses missing secrets before any container start", () => {
  for (const key of [
    "STAGING_SESSION_SECRET",
    "MFA_ENCRYPTION_KEY",
    "WEBHOOK_SECRET_ENCRYPTION_KEY",
    "STAGING_MQTT_CLIENT_KEY",
    "METERWERK_MIGRATIONS_IMAGE",
  ])
    assert.throws(() => compose({ [key]: "" }));
});

test("preflight CLI validates external settings without printing secret values", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/verify-staging-config.mjs", envFile],
    {
      encoding: "utf8",
      env: { ...process.env, ...values },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  assert.match(output, /Staging configuration passed/);
  assert(!output.includes(values.STAGING_SESSION_SECRET));
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        ["scripts/verify-staging-config.mjs", envFile],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            ...values,
            STAGING_APP_URL: "https://wrong-host.invalid",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      ),
    (error) => {
      assert.notEqual(error.status, 0);
      assert.match(error.stderr, /invalid APP_URL/);
      assert(!error.stderr.includes(values.STAGING_SESSION_SECRET));
      assert(!error.stderr.includes(values.STAGING_POSTGRES_PASSWORD));
      return true;
    },
  );
});

test("reviewed broker and proxy templates require mTLS, separate health ACLs and restricted HTTPS", () => {
  const broker = readFileSync("infra/mosquitto/staging.conf", "utf8");
  assert.deepEqual(
    [...broker.matchAll(/^listener (.+)$/gm)].map((match) => match[1].trim()),
    ["8883"],
  );
  for (const directive of [
    "allow_anonymous false",
    "require_certificate true",
    "use_identity_as_username true",
    "crlfile /mosquitto/secrets/ca.crl",
    "tls_version tlsv1.2",
  ])
    assert(broker.includes(directive));
  const acl = readFileSync("infra/mosquitto/staging.acl", "utf8");
  assert.doesNotMatch(acl, /^pattern|^topic .*#/m);
  assert.equal(
    acl.split("user meterwerk-health")[1].trim(),
    "topic readwrite meterwerk/staging/health",
  );
  const proxy = readFileSync(
    "infra/staging/apache-staging.conf.example",
    "utf8",
  );
  assert.deepEqual(
    [...proxy.matchAll(/^\s*ServerName (.+)$/gm)].map((match) =>
      match[1].trim(),
    ),
    ["staging.fesch-elektrotechnik.de", "staging.fesch-elektrotechnik.de"],
  );
  assert.match(proxy, /ProxyPass "\/" "http:\/\/127\.0\.0\.1:3000\/"/);
  assert.match(proxy, /ProxyPassReverse "\/" "http:\/\/127\.0\.0\.1:3000\/"/);
  assert.match(proxy, /Include "__STAGING_ACCESS_ALLOWLIST__"/);
  assert.match(proxy, /ProxyRequests Off/);
  assert.match(proxy, /ProxyAddHeaders Off/);
  assert.match(proxy, /ProxyPassInherit Off/);
  assert.match(
    proxy,
    /RequestHeader set X-Forwarded-For "expr=%\{CONN_REMOTE_ADDR\}"/,
  );
  assert.match(proxy, /RequestHeader set X-Forwarded-Proto "https"/);
  for (const name of [
    "Forwarded",
    "X-Forwarded-For",
    "X-Forwarded-Host",
    "X-Forwarded-Proto",
    "X-Forwarded-Port",
    "X-Forwarded-Server",
    "X-Forwarded-Prefix",
    "X-Forwarded-Ssl",
    "X-Forwarded-Scheme",
    "X-Real-IP",
  ])
    assert(proxy.includes(`RequestHeader unset ${name}`));
  assert.match(proxy, /\[R=308,L,NE\]/);
  assert.equal([...proxy.matchAll(/RewriteCond %\{HTTP_HOST\}/g)].length, 2);
  assert.match(proxy, /SSLCertificateFile "__STAGING_WEB_TLS_CERT__"/);
  assert.match(proxy, /SSLCertificateKeyFile "__STAGING_WEB_TLS_KEY__"/);
  assert.doesNotMatch(proxy, /^\s*(?:Listen|ServerAlias)\b/m);
  const aclProxy = readFileSync(
    "infra/staging/apache-allowlist.conf.example",
    "utf8",
  );
  assert.doesNotMatch(
    aclProxy.replace(/^#.*$/gm, ""),
    /Require all granted|X-Forwarded/,
  );
  assert.match(aclProxy, /Require expr "%\{CONN_REMOTE_ADDR\} -ipmatch/);
});

test("preflight rejects public ports, insecure MQTT, seed config, bad origins, reused secrets and wrong database", () => {
  const base = compose();
  for (const mutate of [
    (c) => {
      c.services.web.ports[0].host_ip = "0.0.0.0";
    },
    (c) => {
      c.services.db.ports = [{ target: 5432, published: "5432" }];
    },
    (c) => {
      c.services.mqtt.ports = [{ target: 8883, published: "8883" }];
    },
    (c) => {
      c.services["mqtt-worker"].environment.MQTT_BROKER_URL =
        "mqtt://mqtt:1883";
    },
    (c) => {
      c.services.web.environment.SEED_DEMO = "true";
    },
    (c) => {
      c.services.web.environment.APP_URL = "http://localhost:3000";
    },
    (c) => {
      c.services.web.environment.MFA_ENCRYPTION_KEY =
        c.services.web.environment.SESSION_SECRET;
    },
    (c) => {
      c.services.web.environment.DATABASE_URL =
        "postgresql://user:secret@production:5432/customer";
    },
    (c) => {
      c.services.web.image = "meterwerk:latest";
    },
    (c) => {
      c.services["mqtt-worker"].image = "meterwerk-worker:latest";
    },
    (c) => {
      c.services.migrations.image = "meterwerk-migrations:latest";
    },
    (c) => {
      c.services.proxy = { ports: [{ target: 443, published: "443" }] };
    },
    (c) => {
      c.services.web.depends_on.migrations = {
        condition: "service_completed_successfully",
      };
    },
    (c) => {
      c.services["mqtt-worker"].volumes = [];
    },
    (c) => {
      c.services.migrations.profiles = [];
    },
    (c) => {
      c.services.migrations.command = ["pnpm", "db:migrate"];
    },
    (c) => {
      c.services.mqtt.volumes.find((v) => v.type === "bind").read_only = false;
    },
  ]) {
    const changed = structuredClone(base);
    mutate(changed);
    assert.throws(() => assertStagingConfig(changed));
  }
});

test("preflight rejects changed broker config and missing mounted files", () => {
  const config = compose();
  const mounted = config.services.mqtt.volumes.find(
    (v) => v.target === "/mosquitto/config/mosquitto.conf",
  );
  const invalid = join(root, "invalid-config");
  writeFileSync(invalid, "listener 1883\nallow_anonymous true\n");
  mounted.source = invalid;
  assert.throws(() => assertStagingConfig(config));
  mounted.source = join(root, "does-not-exist");
  assert.throws(() => assertStagingConfig(config));
});

test("image preflight enforces same revision/version/digest and the built staging label", () => {
  const config = compose();
  const images = Object.fromEntries(
    ["web", "mqtt-worker", "migrations"].map((name) => [
      name,
      {
        RepoDigests: [config.services[name].image],
        Architecture: "amd64",
        Os: "linux",
        Config: {
          Labels: {
            "org.opencontainers.image.revision": values.GIT_COMMIT_SHA,
            "org.opencontainers.image.version": values.RELEASE_VERSION,
            "de.meterwerk.environment": "staging",
          },
        },
      },
    ]),
  );
  assertStagingImages(config, images);
  for (const name of ["web", "mqtt-worker", "migrations"]) {
    for (const field of [
      "org.opencontainers.image.revision",
      "org.opencontainers.image.version",
    ]) {
      const changed = structuredClone(images);
      changed[name].Config.Labels[field] = "wrong";
      assert.throws(() => assertStagingImages(config, changed));
    }
    const changed = structuredClone(images);
    changed[name].RepoDigests = [];
    assert.throws(() => assertStagingImages(config, changed));
  }
  for (const mutate of [
    (i) => {
      i.web.Config.Labels["de.meterwerk.environment"] = "production";
    },
    (i) => {
      i.migrations.Config.Labels["org.opencontainers.image.revision"] =
        "c".repeat(40);
    },
    (i) => {
      i["mqtt-worker"].RepoDigests = [];
    },
  ]) {
    const changed = structuredClone(images);
    mutate(changed);
    assert.throws(() => assertStagingImages(config, changed));
  }
});

test("publish policy permits exactly three SHA-tagged images and requires all gates before login", () => {
  const text = readFileSync(".github/workflows/publish-images.yml", "utf8");
  assertWorkflowSecurity("publish-images.yml", text);
  const workflow = yaml.load(text);
  for (const mutate of [
    (w) => {
      w.on.push = {};
    },
    (w) => {
      w.permissions.contents = "write";
    },
    (w) => {
      w.jobs.publish.env.GITHUB_SHA = "not-the-checkout";
    },
    (w) => {
      w.jobs.publish.steps.find((s) =>
        s.uses?.startsWith("actions/checkout@"),
      ).with.ref = "main";
    },
    (w) => {
      w.jobs.publish.steps.at(-1).run +=
        '\ndocker push "ghcr.io/other/image:$GITHUB_SHA"\n';
    },
    (w) => {
      w.jobs.publish.steps.at(-1).run = w.jobs.publish.steps
        .at(-1)
        .run.replace(
          'docker push "ghcr.io/florian1518/meterwerk-migrations:$GITHUB_SHA"',
          'docker push "ghcr.io/florian1518/meterwerk-migrations:latest"',
        );
    },
    (w) => {
      w.jobs.publish.steps = w.jobs.publish.steps.filter(
        (s) => !s.run?.includes("pnpm exec prisma --version"),
      );
    },
    (w) => {
      w.jobs.publish.steps.find((s) =>
        s.run?.includes("scripts/verify-worker-image-runtime.mjs"),
      )["continue-on-error"] = true;
    },
    (w) => {
      w.jobs.publish.steps.find((s) =>
        s.run?.includes("scripts/verify-web-image-runtime.mjs"),
      ).if = "false";
    },
    (w) => {
      const steps = w.jobs.publish.steps;
      const index = steps.findIndex((s) => s.run?.includes("docker login"));
      steps.unshift(...steps.splice(index, 1));
    },
  ]) {
    const changed = structuredClone(workflow);
    mutate(changed);
    assert.throws(() =>
      assertWorkflowSecurity("publish-images.yml", yaml.dump(changed)),
    );
  }
});

test("build wiring supplies staging at build time and keeps migration tooling separate", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const builder = dockerfile
    .split("AS builder")[1]
    .split("FROM node:22-alpine AS runner")[0];
  assert.match(builder, /ARG NEXT_PUBLIC_METERWERK_ENV/);
  assert.match(
    builder,
    /NEXT_PUBLIC_METERWERK_ENV=\$NEXT_PUBLIC_METERWERK_ENV[\s\S]*pnpm build/,
  );
  const publish = readFileSync(".github/workflows/publish-images.yml", "utf8");
  assert.match(publish, /--build-arg NEXT_PUBLIC_METERWERK_ENV=staging/);
  for (const name of ["web", "worker", "migrations"])
    assert(
      publish.includes(
        `docker push "ghcr.io/florian1518/meterwerk-${name}:$GITHUB_SHA"`,
      ),
    );
  const migrations = readFileSync("Dockerfile.migrations", "utf8");
  assert.match(migrations, /pnpm install --frozen-lockfile --prod=false/);
  assert.match(migrations, /COPY scripts\/verify-migration-baseline.mjs/);
  assert.match(migrations, /COREPACK_ENABLE_NETWORK=0/);
  assert.doesNotMatch(
    migrations,
    /CMD.*(?:db:migrate|migrate.*deploy)|ENTRYPOINT.*migrate/,
  );
  assert.match(migrations, /USER node/);
});
