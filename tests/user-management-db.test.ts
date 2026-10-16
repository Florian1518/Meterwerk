import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Actor } from "../src/server/policy";
vi.mock("@/server/db", () => ({ db }));
import { hashPassword, verifyPassword } from "../src/server/password";

// Never reads DATABASE_URL or .env. Fresh loopback-only, passwordless test cluster.
mkdirSync(".local", { recursive: true });
const directory = mkdtempSync(resolve(".local/user-management-test-"));
const port = 55450;
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

it("enforces tenant user isolation, password validation and last-admin protection through mutate", async () => {
  const { mutate } = await import("@/server/mutations");
  const { listResource, listTenants } = await import("@/server/data");
  await db.plan.update({
    where: { code: "BASIC" },
    data: {
      code: "BASIC",
      name: "Test",
      maxUsers: 500,
      maxProperties: 10,
      maxMeters: 10,
      maxGateways: 10,
    },
  });
  const actor: Actor = await db.user.create({
    data: {
      name: "Platform",
      email: "platform@example.invalid",
      role: "SUPER_ADMIN",
      passwordHash: await hashPassword("test-password-12345"),
    },
  });
  const first = await mutate(actor, {
    kind: "tenants",
    name: "First",
    slug: "first",
  });
  const second = await mutate(actor, {
    kind: "tenants",
    name: "Second",
    slug: "second",
  });
  await mutate(actor, {
    kind: "tenants",
    operation: "update",
    id: first.id,
    name: "Updated",
    slug: "first",
  });
  expect((await listTenants(actor)).find((t) => t.id === first.id)?.name).toBe(
    "Updated",
  );
  const input = {
    kind: "users",
    name: "Admin",
    email: "admin@example.invalid",
    role: "TENANT_ADMIN",
    password: "test-password-12345",
  };
  const created = await mutate(actor, input, first.id);
  const admin = await db.user.findUniqueOrThrow({ where: { id: created.id } });
  expect(admin.active).toBe(true);
  expect(await verifyPassword(admin.passwordHash, input.password)).toBe(true);
  const own: Actor = admin;
  const listed = await listResource(actor, "users", first.id);
  expect(listed.map((u) => u.id)).toEqual([created.id]);
  expect(listed[0]).not.toHaveProperty("passwordHash");
  expect(listed[0]).not.toHaveProperty("mfaSecretEncrypted");
  expect(await listResource(own, "users")).toEqual(listed);
  await expect(listResource(actor, "users")).rejects.toMatchObject({
    status: 400,
  });
  await expect(mutate(actor, input)).rejects.toMatchObject({ status: 400 });
  await expect(listResource(own, "users", second.id)).rejects.toMatchObject({
    status: 403,
  });
  for (const role of ["MANAGER", "USER"] as const) {
    await expect(listResource({ ...own, role }, "users")).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(mutate({ ...own, role }, input)).rejects.toMatchObject({
      status: 403,
    });
    for (const operation of ["update", "delete"]) {
      await expect(
        mutate(
          { ...own, role },
          { ...input, operation, id: created.id, confirmation: "DELETE" },
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
  }
  await expect(mutate(own, input, second.id)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    mutate(actor, { ...input, role: "SUPER_ADMIN" }, first.id),
  ).rejects.toThrow();
  for (const password of ["", "x".repeat(13)])
    await expect(
      mutate(actor, { ...input, password }, first.id),
    ).rejects.toThrow("mindestens 14");
  const member = await mutate(own, {
    ...input,
    role: "USER",
    email: "member@example.invalid",
    password: "x".repeat(14),
  });
  await expect(
    mutate(
      actor,
      { ...input, operation: "update", id: member.id, password: "" },
      second.id,
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    mutate(own, {
      ...input,
      operation: "update",
      id: member.id,
      role: "SUPER_ADMIN",
      password: "",
    }),
  ).rejects.toThrow();
  await mutate(
    actor,
    {
      ...input,
      operation: "update",
      id: created.id,
      name: "Renamed",
      password: "",
      tenantId: second.id,
    },
    first.id,
  );
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: created.id } }))
      .passwordHash === admin.passwordHash,
  ).toBe(true);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: created.id } })).tenantId,
  ).toBe(first.id);
  for (const change of [
    { active: false },
    { role: "MANAGER" },
    { role: "USER" },
    { operation: "delete", confirmation: "DELETE" },
  ]) {
    await expect(
      mutate(
        actor,
        {
          ...input,
          operation: "update",
          id: created.id,
          password: "",
          ...change,
        },
        first.id,
      ),
    ).rejects.toThrow("Mindestens ein aktiver Kundenadministrator");
    expect(
      await db.user.findUnique({
        where: { id: created.id },
        select: { active: true, role: true },
      }),
    ).toEqual({ active: true, role: "TENANT_ADMIN" });
  }
  await expect(
    mutate(own, {
      ...input,
      operation: "delete",
      id: created.id,
      confirmation: "DELETE",
    }),
  ).rejects.toThrow("eigenen Zugang");
  await mutate(own, {
    ...input,
    operation: "update",
    id: member.id,
    email: "member@example.invalid",
    role: "MANAGER",
    active: false,
    password: "replacement-password",
  });
  const updated = await db.user.findUniqueOrThrow({ where: { id: member.id } });
  expect(updated.active).toBe(false);
  expect(
    await verifyPassword(updated.passwordHash, "replacement-password"),
  ).toBe(true);
  expect(
    await db.auditEvent.count({
      where: { action: "users.create", tenantId: first.id },
    }),
  ).toBe(2);
  await db.user.createMany({
    data: Array.from({ length: 201 }, (_, i) => ({
      tenantId: first.id,
      name: `Member ${i}`,
      email: `member-${i}@example.invalid`,
      passwordHash: admin.passwordHash,
    })),
  });
  expect(await listResource(actor, "users", first.id)).toHaveLength(203);
  expect(await listResource(actor, "users", second.id)).toHaveLength(0);
  await mutate(actor, {
    kind: "tenants",
    operation: "delete",
    id: second.id,
    confirmation: "DELETE",
  });
  expect(await listTenants(actor)).toHaveLength(1);
}, 60000);
