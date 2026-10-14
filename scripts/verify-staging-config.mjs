import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const origin = "https://staging.fesch-elektrotechnik.de";
const apps = ["web", "rules-worker", "rollout-worker", "mqtt-worker"];
const digest = /@sha256:[a-f0-9]{64}$/;

// Only errors naming a setting are emitted: never print resolved Compose secrets.
export function assertStagingConfig(config, { checkFiles = true } = {}) {
  const require = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  require(Object.keys(config.services ?? {})
    .sort()
    .join() ===
    [...apps, "db", "mqtt", "migrations"]
      .sort()
      .join(), "Only the seven approved staging services are allowed; the proxy runs on the host");
  require(config.networks?.staging?.internal ===
    true, "Private staging network required");
  for (const name of [...apps, "db", "mqtt", "migrations"]) {
    const service = config.services?.[name];
    if (name !== "migrations")
      require(!service.depends_on
        ?.migrations, `${name}: must not start migrations automatically`);
    require(service &&
      digest.test(service.image), `${name}: immutable image digest required`);
    require(!service.build, `${name}: use a published image, not a host build`);
    require(!service.network_mode, `${name}: host networking is forbidden`);
    require(Object.keys(service.networks ?? {}).join() ===
      "staging", `${name}: only the private network is allowed`);
    require(!service.privileged, `${name}: privileged mode forbidden`);
    require(service.restart ===
      (name === "migrations"
        ? "no"
        : "on-failure:5"), `${name}: invalid restart policy`);
    const grace = ["web", "mqtt"].includes(name) ? 30 : 60;
    require(service.stop_grace_period === `${grace}s` ||
      service.stop_grace_period ===
        `${grace / 60}m0s`, `${name}: invalid shutdown grace`);
    require(service.logging?.options?.["max-size"] === "10m" &&
      service.logging?.options?.["max-file"] ===
        "5", `${name}: log rotation required`);
    const ports = service.ports ?? [];
    require(name === "web"
      ? ports.length === 1 &&
          ports[0].host_ip === "127.0.0.1" &&
          String(ports[0].published) === "3000" &&
          ports[0].target === 3000
      : ports.length === 0, `${name}: forbidden host port`);
    require(!("SEED_DEMO" in (service.environment ?? {})) &&
      !(
        "DEMO_PASSWORD" in (service.environment ?? {})
      ), `${name}: demo seed configuration forbidden`);
    for (const volume of service.volumes ?? []) {
      if (volume.type !== "bind") continue;
      require(volume.read_only === true &&
        volume.bind?.create_host_path ===
          false, `${name}: host files must be read-only and pre-existing`);
      require(isAbsolute(
        volume.source,
      ), `${name}: absolute host file path required`);
      const rel = relative(process.cwd(), volume.source);
      require(rel.startsWith("..") ||
        isAbsolute(rel), `${name}: host files must live outside the checkout`);
      if (checkFiles)
        require(statSync(volume.source, {
          throwIfNoEntry: false,
        })?.isFile(), `${name}: external host file missing`);
    }
  }
  const web = config.services.web.environment;
  const keys = [
    "SESSION_SECRET",
    "MFA_ENCRYPTION_KEY",
    "WEBHOOK_SECRET_ENCRYPTION_KEY",
  ];
  for (const key of keys)
    require(typeof web[key] === "string" &&
      web[key].length >= 32 &&
      !/development|ci-only|change.?me|replace|example/i.test(
        web[key],
      ), `${key}: independent staging secret required`);
  require(new Set(keys.map((key) => web[key])).size ===
    keys.length, "Staging secrets must be independent");
  require(/^[a-f0-9]{40}$/.test(
    web.GIT_COMMIT_SHA,
  ), "Full release commit SHA required");
  require(/^v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(
    web.RELEASE_VERSION,
  ), "Valid release version required");
  for (const name of apps) {
    const env = config.services[name].environment;
    for (const [key, value] of Object.entries({
      NODE_ENV: "production",
      METERWERK_ENV: "staging",
      APP_URL: origin,
      STAGING_APP_URL: origin,
      BASE_DOMAIN: "staging.fesch-elektrotechnik.de",
      TRUSTED_HOSTS: "staging.fesch-elektrotechnik.de",
      EMAIL_PROVIDER: "local",
      LOG_LEVEL: "INFO",
      MQTT_BROKER_URL: "mqtts://mqtt:8883",
      ATTACHMENT_STORAGE: "local",
      NEXT_PUBLIC_METERWERK_ENV: "staging",
    }))
      require(env[key] === value, `${name}: invalid ${key}`);
    for (const key of [
      ...keys,
      "DATABASE_URL",
      "RELEASE_VERSION",
      "GIT_COMMIT_SHA",
    ])
      require(env[key] === web[key], `${name}: inconsistent ${key}`);
    require(env.BUILD_VERSION ===
      web.RELEASE_VERSION, `${name}: inconsistent BUILD_VERSION`);
    require(!env.RATE_LIMIT_BACKEND ||
      env.RATE_LIMIT_BACKEND ===
        "postgres", `${name}: local rate limiting forbidden`);
  }
  let database;
  try {
    database = new URL(web.DATABASE_URL);
  } catch {
    throw new Error("Invalid staging DATABASE_URL");
  }
  require(database.protocol === "postgresql:" &&
    database.hostname === "db" &&
    database.port === "5432" &&
    database.pathname === "/meterwerk_staging" &&
    database.username === "meterwerk_staging" &&
    !database.search, "Database must be the isolated internal staging target");
  const postgres = config.services.db.environment;
  require(postgres.POSTGRES_DB === "meterwerk_staging" &&
    postgres.POSTGRES_USER ===
      "meterwerk_staging", "Invalid staging database identity");
  require(typeof postgres.POSTGRES_PASSWORD === "string" &&
    postgres.POSTGRES_PASSWORD.length >= 32 &&
    !/development|ci-only|change.?me|replace|example/i.test(
      postgres.POSTGRES_PASSWORD,
    ), "Strong independent staging database password required");
  require(decodeURIComponent(database.password) ===
    postgres.POSTGRES_PASSWORD, "URL-encoded database password does not match PostgreSQL");
  require(!keys.some(
    (key) => web[key] === postgres.POSTGRES_PASSWORD,
  ), "Database password must be independent");
  const migration = config.services.migrations;
  require(!migration.entrypoint, "Migration entrypoint must not override the read-only default");
  require(migration.profiles?.includes(
    "operations",
  ), "Migrations must be opt-in");
  require(migration.command?.join(" ") ===
    "pnpm exec prisma migrate status", "Default migration command must be read-only");
  for (const key of ["DATABASE_URL", "GIT_COMMIT_SHA", "RELEASE_VERSION"])
    require(migration.environment[key] ===
      web[key], `Migration runner: inconsistent ${key}`);
  const worker = config.services["mqtt-worker"];
  for (const key of [
    "MQTT_CA_PATH",
    "MQTT_CERT_PATH",
    "MQTT_KEY_PATH",
    "MQTT_RECEIPT_KEY_PATH",
  ])
    require(worker.volumes.some(
      (volume) =>
        volume.type === "bind" && volume.target === worker.environment[key],
    ), `MQTT worker: missing ${key} mount`);
  for (const target of [
    "/mosquitto/config/mosquitto.conf",
    "/mosquitto/config/staging.acl",
    ...[
      "ca.crt",
      "ca.crl",
      "server.crt",
      "server.key",
      "health.crt",
      "health.key",
    ].map((file) => `/mosquitto/secrets/${file}`),
  ])
    require(config.services.mqtt.volumes.some(
      (volume) => volume.target === target && volume.type === "bind",
    ), "MQTT broker: missing config or mTLS mount");
  if (checkFiles) {
    for (const [target, template] of [
      ["/mosquitto/config/mosquitto.conf", "infra/mosquitto/staging.conf"],
      ["/mosquitto/config/staging.acl", "infra/mosquitto/staging.acl"],
    ]) {
      const mounted = config.services.mqtt.volumes.find(
        (volume) => volume.target === target,
      );
      require(readFileSync(mounted.source, "utf8").replaceAll("\r\n", "\n") ===
        readFileSync(template, "utf8").replaceAll(
          "\r\n",
          "\n",
        ), "MQTT config/ACL differs from the reviewed staging template");
    }
  }
}

export function assertStagingImages(config, inspections) {
  const expected = config.services.web.environment;
  for (const name of ["web", "mqtt-worker", "migrations"]) {
    const image = inspections[name];
    assert(
      image?.RepoDigests?.includes(config.services[name].image),
      `${name}: image digest mismatch`,
    );
    assert(
      image.Config.Labels["org.opencontainers.image.revision"] ===
        expected.GIT_COMMIT_SHA,
      `${name}: revision mismatch`,
    );
    assert(
      image.Config.Labels["org.opencontainers.image.version"] ===
        expected.RELEASE_VERSION,
      `${name}: version mismatch`,
    );
    assert(
      image.Architecture === "amd64" && image.Os === "linux",
      `${name}: Linux amd64 image required`,
    );
  }
  assert(
    inspections.web.Config.Labels["de.meterwerk.environment"] === "staging",
    "Web image must have been built for staging",
  );
  for (const name of ["rules-worker", "rollout-worker"])
    assert(
      config.services[name].image === config.services["mqtt-worker"].image,
      "Workers must use the same image digest",
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const envFile = process.argv[2];
    if (!envFile || envFile.startsWith("--"))
      throw new Error(
        "Usage: node scripts/verify-staging-config.mjs /absolute/external/staging.env [--images]",
      );
    if (!isAbsolute(envFile))
      throw new Error("Absolute external env-file path required");
    const rel = relative(process.cwd(), envFile);
    if (!rel.startsWith("..") && !isAbsolute(rel))
      throw new Error("Env file must live outside the checkout");
    let config;
    try {
      config = JSON.parse(
        execFileSync(
          "docker",
          [
            "compose",
            "--project-name",
            "meterwerk-staging",
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
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ),
      );
    } catch {
      throw new Error(
        "Compose configuration failed; check required settings locally without publishing resolved secrets",
      );
    }
    assertStagingConfig(config);
    if (process.argv.includes("--images")) {
      const images = {};
      for (const name of ["web", "mqtt-worker", "migrations"]) {
        try {
          images[name] = JSON.parse(
            execFileSync(
              "docker",
              ["image", "inspect", config.services[name].image],
              { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
            ),
          )[0];
        } catch {
          throw new Error(
            `${name}: pull the approved digest before image verification`,
          );
        }
      }
      assertStagingImages(config, images);
    }
    console.log(
      "Staging configuration passed; no containers started and no migrations executed",
    );
  } catch (error) {
    // Filesystem exceptions can contain sensitive host paths; print only a safe summary.
    console.error(
      error.code
        ? "Staging preflight could not read required external files"
        : error.message,
    );
    process.exitCode = 1;
  }
}
