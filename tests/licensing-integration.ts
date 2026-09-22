import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../src/server/db";
import {
  changePlan,
  getEntitlements,
  requireFeature,
  setFeatureOverride,
  setPlanOverride,
  extendTrial,
  setBillingMetadata,
  setSubscriptionStatus,
  tenantBilling,
} from "../src/server/licensing";
import type { Actor } from "../src/server/policy";

if (process.env.SEED_DEMO !== "true" || process.env.NODE_ENV === "production")
  throw new Error("Lokale Demo-Datenbank erforderlich.");
const admin: Actor = {
  id: "platform-admin",
  tenantId: null,
  role: "SUPER_ADMIN",
  name: "Test",
  email: "test@example.invalid",
};
const tenantAdmin: Actor = {
  id: "demo-tenant-0-user-0",
  tenantId: "demo-tenant-0",
  role: "TENANT_ADMIN",
  name: "Tenant",
  email: "tenant@example.invalid",
};
const foreignAdmin: Actor = {
  ...tenantAdmin,
  id: "demo-tenant-1-user-0",
  tenantId: "demo-tenant-1",
};
let checks = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}

try {
  await changePlan(admin, { tenantId: "demo-tenant-0", plan: "BASIC" });
  await check("BASIC disables analytics and advanced exports", async () => {
    const entitlements = await getEntitlements(tenantAdmin);
    assert.equal(entitlements.plan.code, "BASIC");
    assert.equal(entitlements.features.ANALYTICS, false);
    assert.equal(entitlements.features.ADVANCED_EXPORTS, false);
    await assert.rejects(() => requireFeature(tenantAdmin, "ANALYTICS"), {
      status: 403,
    });
  });
  await check("cross-tenant plan access is rejected", async () => {
    await assert.rejects(() => getEntitlements(tenantAdmin, "demo-tenant-1"), {
      status: 403,
    });
    await assert.rejects(
      () =>
        changePlan(tenantAdmin, {
          tenantId: "demo-tenant-1",
          plan: "ENTERPRISE",
        }),
      { status: 403 },
    );
    await assert.rejects(
      () =>
        setFeatureOverride(admin, {
          tenantId: "demo-tenant-1",
          feature: "ANALYTICS",
          enabled: false,
        }),
      { status: 409 },
    );
  });
  await check("SUPER_ADMIN can change a tenant plan", async () => {
    await changePlan(admin, {
      tenantId: "demo-tenant-0",
      plan: "PROFESSIONAL",
    });
    const entitlements = await getEntitlements(tenantAdmin);
    assert.equal(entitlements.plan.code, "PROFESSIONAL");
    assert.equal(entitlements.features.ANALYTICS, true);
  });
  await check("Enterprise feature and limit overrides apply", async () => {
    await changePlan(admin, { tenantId: "demo-tenant-0", plan: "ENTERPRISE" });
    await setFeatureOverride(admin, {
      tenantId: "demo-tenant-0",
      feature: "WEBHOOKS",
      enabled: false,
    });
    await setPlanOverride(admin, { tenantId: "demo-tenant-0", maxMeters: 9 });
    const entitlements = await getEntitlements(tenantAdmin);
    assert.equal(entitlements.features.WEBHOOKS, false);
    assert.equal(entitlements.limits.meters, 9);
  });
  await check("tenant admins cannot manage plans or overrides", async () => {
    await assert.rejects(
      () =>
        changePlan(tenantAdmin, { tenantId: "demo-tenant-0", plan: "BASIC" }),
      { status: 403 },
    );
    await assert.rejects(
      () =>
        setPlanOverride(foreignAdmin, {
          tenantId: "demo-tenant-0",
          maxMeters: 10,
        }),
      { status: 403 },
    );
  });
  await check(
    "trial lifecycle and billing metadata are audited and tenant visible",
    async () => {
      await setSubscriptionStatus(admin, {
        tenantId: "demo-tenant-0",
        status: "TRIAL",
      });
      const first = await db.subscription.findFirstOrThrow({
        where: { tenantId: "demo-tenant-0", status: "TRIAL" },
      });
      assert.ok(first.trialEndsAt && first.endsAt);
      const before = first.trialEndsAt.getTime();
      await extendTrial(admin, { tenantId: "demo-tenant-0", days: 14 });
      const extended = await db.subscription.findUniqueOrThrow({
        where: { id: first.id },
      });
      assert.ok(extended.trialEndsAt!.getTime() >= before + 13 * 86400000);
      await setBillingMetadata(admin, {
        tenantId: "demo-tenant-0",
        billingInterval: "YEARLY",
        priceAmount: "120.50",
        priceCurrency: "EUR",
        billingContactName: "Billing Person",
        billingContactEmail: "billing@example.invalid",
        billingContactCompany: "Meterwerk Test",
        billingContactAddress: "Testweg 1",
        externalBillingId: `external-test-${Date.now()}`,
      });
      const billing = await tenantBilling(tenantAdmin);
      assert.equal(billing.status, "TRIAL");
      assert.equal(billing.billingInterval, "YEARLY");
      assert.equal(billing.priceAmount, "120.5");
      assert.equal(billing.billingContactEmail, "billing@example.invalid");
      await assert.rejects(() => tenantBilling(tenantAdmin, "demo-tenant-1"), {
        status: 403,
      });
      await assert.rejects(
        () => tenantBilling({ ...tenantAdmin, role: "USER" }),
        { status: 403 },
      );
      await setSubscriptionStatus(admin, {
        tenantId: "demo-tenant-0",
        status: "PAST_DUE",
      });
      assert.equal(
        (await getEntitlements(tenantAdmin)).plan.code,
        "ENTERPRISE",
      );
      await setSubscriptionStatus(admin, {
        tenantId: "demo-tenant-0",
        status: "SUSPENDED",
      });
      await assert.rejects(() => getEntitlements(tenantAdmin), { status: 402 });
      await assert.rejects(
        () => extendTrial(admin, { tenantId: "demo-tenant-0", days: 14 }),
        { status: 409 },
      );
      await setSubscriptionStatus(admin, {
        tenantId: "demo-tenant-0",
        status: "ACTIVE",
      });
      const events = await db.auditEvent.findMany({
        where: { tenantId: "demo-tenant-0" },
      });
      for (const action of [
        "subscription.trial_extended",
        "subscription.status_changed",
        "subscription.billing_metadata_changed",
      ])
        assert.ok(events.some((event) => event.action === action));
    },
  );
  await changePlan(admin, { tenantId: "demo-tenant-0", plan: "BASIC" });
  await db.tenantFeatureOverride.deleteMany({
    where: { tenantId: "demo-tenant-0" },
  });
  await db.tenantPlanOverride.deleteMany({
    where: { tenantId: "demo-tenant-0" },
  });
  console.log(`${checks} licensing checks passed.`);
} finally {
  await db.$disconnect();
}
