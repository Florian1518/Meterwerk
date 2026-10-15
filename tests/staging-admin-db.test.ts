import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createInitialStagingAdmin } from "../src/server/staging-admin";
import { verifyPassword } from "../src/server/password";

// Never reads DATABASE_URL or .env. Fresh loopback-only, passwordless test cluster.
mkdirSync(".local", { recursive: true });
const directory = mkdtempSync(resolve(".local/bootstrap-test-"));
const port = 55449;
const url = `postgresql://bootstrap_test@127.0.0.1:${port}/bootstrap_test`;
const postgres = new EmbeddedPostgres({
  databaseDir: directory,
  user: "bootstrap_test",
  password: "",
  port,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
  log: [],
});
let started = false;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const binaryModule = pathToFileURL(
    resolve(dirname(require.resolve("embedded-postgres")), "binary.js"),
  ).href;
  const binaries = await (await import(binaryModule)).default();
  // Use the installed test tooling's binaries, without writing a password file.
  execFileSync(
    binaries.initdb,
    [
      "-D",
      directory,
      "-U",
      "bootstrap_test",
      "--auth=trust",
      "--encoding=UTF8",
      "--locale=C",
    ],
    { stdio: "pipe", windowsHide: true },
  );
  await postgres.start();
  started = true;
  await postgres.createDatabase("bootstrap_test");
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      stdio: "pipe",
      windowsHide: true,
      env: {
        ...process.env,
        DATABASE_URL: url,
        METERWERK_ENV: "test",
        DOTENV_CONFIG_PATH: resolve(directory, "absent.env"),
      },
    },
  );
}, 120000);
afterAll(async () => {
  await db.$disconnect();
  if (started) await postgres.stop();
});

it("rolls back the administrator when the atomic audit fails", async () => {
  await db.$executeRawUnsafe(
    `CREATE FUNCTION reject_bootstrap_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER reject_bootstrap_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_bootstrap_audit()`,
  );
  try {
    await expect(
      createInitialStagingAdmin(
        db,
        { name: "Rollback", email: "rollback@example.invalid" },
        "x".repeat(24),
      ),
    ).rejects.toThrow();
    expect(await db.user.count()).toBe(0);
    expect(await db.auditEvent.count()).toBe(0);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER reject_bootstrap_audit ON "AuditEvent"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION reject_bootstrap_audit()");
  }
});

it("serializes parallel bootstraps, verifies Argon2, audits once and refuses repeat", async () => {
  const plansBefore = await db.plan.count();
  const password = "x".repeat(24); // Public test input, never a deployed credential.
  const results = await Promise.allSettled(
    ["one", "two"].map((name) =>
      createInitialStagingAdmin(
        db,
        { name, email: `${name}@example.invalid` },
        password,
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(await db.user.count()).toBe(1);
  const user = await db.user.findFirstOrThrow();
  expect({
    role: user.role,
    tenantId: user.tenantId,
    active: user.active,
    mfaEnabled: user.mfaEnabled,
  }).toEqual({
    role: "SUPER_ADMIN",
    tenantId: null,
    active: true,
    mfaEnabled: false,
  });
  expect(await verifyPassword(user.passwordHash, password)).toBe(true);
  const success = results.find((r) => r.status === "fulfilled");
  expect(Object.keys(success!.value)).toEqual(["id"]);
  expect(
    await db.auditEvent.count({
      where: { action: "STAGING_ADMIN_BOOTSTRAP", actorId: user.id },
    }),
  ).toBe(1);
  await expect(
    createInitialStagingAdmin(
      db,
      { name: "Third", email: "third@example.invalid" },
      password,
    ),
  ).rejects.toThrow("bereits ein Benutzer");
  expect(await db.tenant.count()).toBe(0);
  expect(await db.plan.count()).toBe(plansBefore);
  expect(await db.subscription.count()).toBe(0);
  // Test-only tenant fixture: ordinary users require a tenant by DB constraint.
  const tenant = await db.tenant.create({
    data: { name: "Test", slug: "bootstrap-test" },
  });
  // Any user blocks bootstrap, regardless of role or activation.
  await db.user.update({
    where: { id: user.id },
    data: { role: "USER", active: false, tenantId: tenant.id },
  });
  await expect(
    createInitialStagingAdmin(
      db,
      { name: "Fourth", email: "fourth@example.invalid" },
      password,
    ),
  ).rejects.toThrow("bereits ein Benutzer");
  expect(await db.user.count()).toBe(1);
}, 30000);
