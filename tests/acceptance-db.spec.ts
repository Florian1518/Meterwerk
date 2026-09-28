import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { Actor } from "../src/server/policy";
// This is DB/service acceptance, explicitly NOT login/session/HTTP acceptance.
const auth = vi.hoisted(() => ({ actor: null as Actor | null }));
vi.mock("../src/server/auth", () => ({
  requireActor: async () => {
    if (!auth.actor) throw new Error("No test actor");
    return auth.actor;
  },
}));
import { db } from "../src/server/db";
import { getDeviceDetail, listDevices } from "../src/server/device-management";
import {
  createSupportCase,
  getSupportCase,
  listSupportCases,
} from "../src/server/support-operations";
import {
  DEMO_SCENARIOS,
  setDemoScenario,
  resetDemoScenario,
} from "../src/server/demo-scenarios";
import {
  beginRestoreTest,
  registerBackup,
  listRecoveryMetadata,
  startDrDrill,
  completeDrDrill,
  assertDrillEnvironment,
} from "../src/server/disaster-recovery";
const suffix = randomUUID();
const platform: Actor = {
  id: `acceptance-platform-${suffix}`,
  tenantId: null,
  role: "SUPER_ADMIN",
  name: "Acceptance",
  email: `platform-${suffix}@example.invalid`,
};
const admin: Actor = {
  ...platform,
  id: `acceptance-admin-${suffix}`,
  tenantId: "demo-multi-utility",
  role: "TENANT_ADMIN",
  email: `admin-${suffix}@example.invalid`,
};
const foreign: Actor = {
  ...admin,
  id: `acceptance-foreign-${suffix}`,
  tenantId: `acceptance-foreign-${suffix}`,
  email: `foreign-${suffix}@example.invalid`,
};
let backupId: string;
let supportId: string;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.METERWERK_ENV).toBe("test");
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.port).toBe("55435");
  expect(url.pathname).toBe("/meterwerk_acceptance");
  await db.tenant.create({
    data: {
      id: foreign.tenantId!,
      slug: foreign.tenantId!,
      name: "Synthetic foreign tenant",
    },
  });
  for (const actor of [platform, admin, foreign])
    await db.user.create({
      data: {
        id: actor.id,
        tenantId: actor.tenantId,
        role: actor.role,
        email: actor.email,
        name: actor.name,
        passwordHash: "disabled-acceptance-login",
      },
    });
  expect(
    await db.device.count({ where: { tenantId: admin.tenantId! } }),
  ).toBeGreaterThanOrEqual(4);
});
afterAll(async () => {
  await db.$disconnect();
});
describe.sequential(
  "Acceptance DB services (injected actor, real PostgreSQL)",
  () => {
    it("device list/detail are tenant-bound and paginated", async () => {
      auth.actor = admin;
      const page = await listDevices({ pageSize: 2 });
      expect(page.items).toHaveLength(2);
      expect(page.total).toBeGreaterThanOrEqual(4);
      const detail = await getDeviceDetail("demo-multi-utility-WATER");
      expect(detail.tenantId).toBe(admin.tenantId);
      expect(JSON.stringify(detail.credentials)).not.toContain("tokenHash");
    });
    it("device foreign IDs and explicit tenant escalation are rejected", async () => {
      auth.actor = foreign;
      await expect(
        getDeviceDetail("demo-multi-utility-WATER"),
      ).rejects.toMatchObject({ status: 404 });
      await expect(listDevices({}, admin.tenantId)).rejects.toMatchObject({
        status: 403,
      });
    });
    it("device USER without grants has no detail or aggregate visibility", async () => {
      auth.actor = { ...admin, role: "USER" };
      expect((await listDevices()).total).toBe(0);
      await expect(
        getDeviceDetail("demo-multi-utility-WATER"),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("device SUPER_ADMIN must choose a tenant", async () => {
      auth.actor = platform;
      await expect(listDevices()).rejects.toMatchObject({ status: 400 });
      expect(
        (await listDevices({}, admin.tenantId)).total,
      ).toBeGreaterThanOrEqual(4);
    });
    it("support create/detail/list includes an audit event", async () => {
      auth.actor = admin;
      const row = await createSupportCase({
        title: `Acceptance ${suffix}`,
        description: "Synthetic local support case",
        category: "OTHER",
      });
      supportId = row.id;
      expect((await getSupportCase(row.id)).tenantId).toBe(admin.tenantId);
      expect(
        (await listSupportCases()).items.some((item) => item.id === row.id),
      ).toBe(true);
      expect(
        await db.auditEvent.count({
          where: { entityId: row.id, action: "support-case.opened" },
        }),
      ).toBe(1);
    });
    it("support foreign ID and foreign tenant are rejected", async () => {
      auth.actor = foreign;
      await expect(getSupportCase(supportId)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        getSupportCase(supportId, admin.tenantId),
      ).rejects.toMatchObject({ status: 403 });
    });
    it.each(DEMO_SCENARIOS)(
      "demo metadata persists %s (no simulated product effects claimed)",
      async (scenario) => {
        auth.actor = platform;
        const row = await setDemoScenario(platform, scenario);
        expect(row.scenario).toBe(scenario);
        expect(
          (
            await db.demoScenarioState.findUniqueOrThrow({
              where: { environment: "test" },
            })
          ).scenario,
        ).toBe(scenario);
        expect(
          await db.auditEvent.count({
            where: {
              entityId: row.id,
              actorId: platform.id,
              action: "demo.scenario.activated",
            },
          }),
        ).toBeGreaterThan(0);
      },
    );
    it("demo rejects tenant administrators and resets metadata to NORMAL", async () => {
      await expect(setDemoScenario(admin, "NORMAL")).rejects.toMatchObject({
        status: 403,
      });
      expect((await resetDemoScenario(platform)).scenario).toBe("NORMAL");
    });
    it("DR registers explicitly pending synthetic metadata and audits it", async () => {
      auth.actor = platform;
      const row = await registerBackup({
        type: "acceptance-metadata-only",
        environment: "test",
        startedAt: new Date(),
        status: "PENDING",
        appVersion: "0.1.0",
        gitCommit: "09427c6b74c1ae3cb4355fa51ac3e6c531f1045e",
        migrationVersion: "acceptance",
        storageReference: "acceptance/no-real-backup",
      });
      backupId = row.id;
      const metadata = await listRecoveryMetadata();
      expect(metadata.backups.some((item) => item.id === row.id)).toBe(true);
      expect(JSON.stringify(metadata)).not.toContain("storageReference");
      expect(
        await db.auditEvent.count({
          where: { entityId: row.id, action: "recovery.backup.registered" },
        }),
      ).toBe(1);
    });
    it("DR rejects production restore target and an unverified backup", async () => {
      auth.actor = platform;
      await expect(
        beginRestoreTest(backupId, "production"),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        beginRestoreTest(backupId, "meterwerk_restore_test_acceptance"),
      ).rejects.toMatchObject({ status: 404 });
      expect(() => assertDrillEnvironment("production")).toThrow();
    });
    it("DR tenant administrator cannot read global recovery metadata", async () => {
      auth.actor = admin;
      await expect(listRecoveryMetadata()).rejects.toMatchObject({
        status: 403,
      });
    });
    it("DR drill model persists FAILED and synthetic RPO/RTO without claiming a restore", async () => {
      auth.actor = platform;
      const drill = await startDrDrill({
        type: "acceptance-model-only",
        environment: "test",
      });
      expect(drill.findings).toEqual([]);
      expect(drill.actions).toEqual([]);
      const completed = await completeDrDrill({
        id: drill.id,
        checksPassed: false,
        recoveryStartedAt: new Date("2026-09-01T00:00:00Z"),
        completedAt: new Date("2026-09-01T00:01:00Z"),
        rtoTargetSeconds: 120,
        rpoTargetSeconds: 30,
        rpoObservedSeconds: 10,
      });
      expect(completed.status).toBe("FAILED");
      expect(completed.rtoObservedSeconds).toBe(60);
      expect(completed.rpoObservedSeconds).toBe(10);
    });
  },
);
