import "server-only";
import { z } from "zod";
import { db } from "./db";
import {
  AccessError,
  requireManage,
  requirePlatform,
  tenantScope,
  type Actor,
} from "./policy";
import type {
  FeatureKey,
  PlanCode,
  SupportLevel,
  Prisma,
} from "@/generated/prisma/client";

export const featureKeys = [
  "REPORTING",
  "ANALYTICS",
  "API",
  "WEBHOOKS",
  "ADVANCED_EXPORTS",
] as const;
export const quotaKeys = [
  "properties",
  "buildings",
  "units",
  "meters",
  "devices",
  "users",
  "gateways",
] as const;
export const quotaLabels = {
  properties: "Liegenschaften",
  buildings: "Gebäude",
  units: "Nutzungseinheiten",
  meters: "Zähler",
  devices: "Devices",
  users: "Benutzer",
  gateways: "Gateways",
};
export type Feature = (typeof featureKeys)[number];
export type Quota = (typeof quotaKeys)[number];
export type Entitlements = {
  tenantId: string;
  plan: {
    id: string;
    code: PlanCode;
    name: string;
    supportLevel: SupportLevel;
  };
  limits: Record<Quota, number>;
  features: Record<Feature, boolean>;
};

const unlimited = 2_147_483_647;
function asFeatures(
  rows: { feature: FeatureKey; enabled: boolean }[],
): Record<Feature, boolean> {
  return Object.fromEntries(
    featureKeys.map((feature) => [
      feature,
      rows.find((row) => row.feature === feature)?.enabled ?? false,
    ]),
  ) as Record<Feature, boolean>;
}

export async function getEntitlements(
  actor: Actor,
  requested?: string | null,
): Promise<Entitlements> {
  const tenantId = tenantScope(actor, requested);
  return getTenantEntitlements(tenantId);
}

export async function getTenantEntitlements(
  tenantId: string,
  client: Prisma.TransactionClient = db,
  allowEnded = false,
): Promise<Entitlements> {
  const subscription = await client.subscription.findFirst({
    where: allowEnded
      ? { tenantId }
      : {
          tenantId,
          status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] },
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
    orderBy: { startsAt: "desc" },
    include: {
      plan: { include: { features: true } },
      tenant: { include: { featureOverrides: true, planOverride: true } },
    },
  });
  if (!subscription)
    throw new AccessError(
      402,
      "Für diesen Kunden ist kein aktiver SaaS-Plan hinterlegt.",
    );
  const override =
    subscription.plan.code === "ENTERPRISE"
      ? subscription.tenant.planOverride
      : null;
  const features = asFeatures(subscription.plan.features);
  for (const row of subscription.plan.code === "ENTERPRISE"
    ? subscription.tenant.featureOverrides
    : [])
    features[row.feature] = row.enabled;
  return {
    tenantId,
    plan: {
      id: subscription.plan.id,
      code: subscription.plan.code,
      name: subscription.plan.name,
      supportLevel: subscription.plan.supportLevel,
    },
    limits: {
      properties: override?.maxProperties ?? subscription.plan.maxProperties,
      meters: override?.maxMeters ?? subscription.plan.maxMeters,
      users: override?.maxUsers ?? subscription.plan.maxUsers,
      gateways: override?.maxGateways ?? subscription.plan.maxGateways,
      buildings: override?.maxBuildings ?? subscription.plan.maxBuildings,
      units: override?.maxUnits ?? subscription.plan.maxUnits,
      devices: override?.maxDevices ?? subscription.plan.maxDevices,
    },
    features,
  };
}

export async function hasFeature(
  actor: Actor,
  feature: Feature,
  requested?: string | null,
) {
  return (await getEntitlements(actor, requested)).features[feature];
}

export async function requireTenantFeature(tenantId: string, feature: Feature) {
  if (!(await getTenantEntitlements(tenantId)).features[feature])
    throw new AccessError(
      403,
      `Das Feature ${feature.toLowerCase()} ist im aktuellen SaaS-Plan nicht aktiviert.`,
    );
}

export async function requireFeature(
  actor: Actor,
  feature: Feature,
  requested?: string | null,
) {
  if (!(await hasFeature(actor, feature, requested)))
    throw new AccessError(
      403,
      `Das Feature ${feature.toLowerCase()} ist im aktuellen SaaS-Plan nicht aktiviert.`,
    );
}

export async function requireQuota(
  actor: Actor,
  quota: Quota,
  requested?: string | null,
) {
  requireManage(actor);
  return db.$transaction((tx) =>
    requireTenantQuota(tx, tenantScope(actor, requested), quota),
  );
}

// All resource creators must call this inside the creation transaction.
// The tenant lock is held until creation and its audit event have committed.
export async function requireTenantQuota(
  tx: Prisma.TransactionClient,
  tenantId: string,
  quota: Quota,
) {
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
  const entitlements = await getTenantEntitlements(tenantId, tx);
  const count = await countResource(tx, tenantId, quota);
  if (count >= entitlements.limits[quota])
    throw new AccessError(
      409,
      `Das Limit für ${quotaLabels[quota]} ist erreicht (${count.toLocaleString("de-DE")} von ${entitlements.limits[quota].toLocaleString("de-DE")}). Neue Einträge sind erst nach einer Limiterhöhung oder Bestandsreduzierung möglich. Bestehende Daten bleiben verfügbar.`,
    );
  return entitlements;
}

function countResource(
  tx: Prisma.TransactionClient,
  tenantId: string,
  quota: Quota,
) {
  const where = { tenantId };
  switch (quota) {
    case "properties":
      return tx.property.count({ where });
    case "buildings":
      return tx.building.count({ where });
    case "units":
      return tx.unit.count({ where });
    case "meters":
      return tx.meter.count({ where });
    case "devices":
      return tx.device.count({ where });
    case "gateways":
      return tx.gateway.count({ where });
    case "users":
      return tx.user.count({ where });
  }
}

export function usageLevel(count: number, limit: number) {
  const percent =
    limit === unlimited ? null : limit === 0 ? 100 : (count / limit) * 100;
  const warning =
    percent === null
      ? null
      : percent >= 100
        ? 100
        : percent >= 90
          ? 90
          : percent >= 80
            ? 80
            : null;
  return { percent, warning };
}

export async function tenantUsage(actor: Actor, requested?: string | null) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  return db.$transaction(
    async (tx) => {
      const entitlements = await getTenantEntitlements(tenantId, tx, true);
      const resources = [];
      for (const key of quotaKeys) {
        const count = await countResource(tx, tenantId, key);
        const limit = entitlements.limits[key];
        resources.push({
          key,
          label: quotaLabels[key],
          count,
          limit: limit === unlimited ? null : limit,
          ...usageLevel(count, limit),
        });
      }
      const month = new Date().toISOString().slice(0, 7);
      const counters = await tx.tenantUsageCounter.findMany({
        where: { tenantId, month },
      });
      const reports = await tx.report.count({ where: { tenantId } });
      return {
        tenantId,
        plan: entitlements.plan,
        resources,
        month,
        reports,
        apiRequests: counters.find((c) => c.kind === "API")?.count ?? 0,
        exports: counters.find((c) => c.kind === "EXPORT")?.count ?? 0,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

// Internal helper: callers authenticate and authorize the tenant before recording.
export async function recordTenantUsage(
  tenantId: string,
  kind: "API" | "EXPORT",
) {
  const month = new Date().toISOString().slice(0, 7);
  await db.tenantUsageCounter.upsert({
    where: { tenantId_month_kind: { tenantId, month, kind } },
    create: { tenantId, month, kind, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export async function listPlans(actor: Actor) {
  requirePlatform(actor);
  return db.plan.findMany({
    orderBy: { code: "asc" },
    include: { features: true },
  });
}

export async function tenantSubscription(actor: Actor, requested: string) {
  requirePlatform(actor);
  return db.subscription.findFirst({
    where: { tenantId: requested },
    orderBy: { startsAt: "desc" },
    include: {
      plan: { include: { features: true } },
      tenant: { include: { featureOverrides: true, planOverride: true } },
    },
  });
}

/** Billing details are tenant-private; platform admins must select a tenant explicitly. */
export async function tenantBilling(actor: Actor, requested?: string | null) {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "TENANT_ADMIN")
    throw new AccessError(
      403,
      "Nur Kundenadministratoren können SaaS-Vertragsdaten einsehen.",
    );
  const tenantId = tenantScope(actor, requested);
  const subscription = await db.subscription.findFirst({
    where: { tenantId },
    orderBy: { startsAt: "desc" },
    include: {
      plan: { include: { features: true } },
      tenant: { include: { featureOverrides: true, planOverride: true } },
    },
  });
  if (!subscription)
    throw new AccessError(404, "Kein aktuelles SaaS-Abonnement gefunden.");
  const entitlements = await getTenantEntitlements(tenantId, db, true);
  return {
    id: subscription.id,
    status: subscription.status,
    startsAt: subscription.startsAt,
    endsAt: subscription.endsAt,
    trialEndsAt: subscription.trialEndsAt,
    billingInterval: subscription.billingInterval,
    priceAmount: subscription.priceAmount?.toString() ?? null,
    priceCurrency: subscription.priceCurrency,
    billingContactName: subscription.billingContactName,
    billingContactEmail: subscription.billingContactEmail,
    billingContactCompany: subscription.billingContactCompany,
    billingContactAddress: subscription.billingContactAddress,
    plan: subscription.plan,
    limits: entitlements.limits,
    features: entitlements.features,
  };
}

const assignment = z
  .object({
    tenantId: z.string().min(1),
    plan: z.enum(["BASIC", "PROFESSIONAL", "ENTERPRISE"]),
    startsAt: z.coerce.date().optional(),
    billingInterval: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
    priceAmount: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/)
      .nullable()
      .optional(),
    priceCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
  })
  .refine(
    (value) => !value.startsAt || value.startsAt <= new Date(),
    "Ein Planwechsel muss sofort gelten.",
  );
export async function changePlan(actor: Actor, input: unknown) {
  requirePlatform(actor);
  const value = assignment.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${value.tenantId} FOR UPDATE`;
    const plan = await tx.plan.findUnique({ where: { code: value.plan } });
    if (!plan) throw new AccessError(404, "Plan nicht gefunden.");
    await tx.subscription.updateMany({
      where: {
        tenantId: value.tenantId,
        status: { in: ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] },
      },
      data: { status: "CANCELED", endsAt: value.startsAt ?? new Date() },
    });
    const subscription = await tx.subscription.create({
      data: {
        tenantId: value.tenantId,
        planId: plan.id,
        startsAt: value.startsAt ?? new Date(),
        billingInterval: value.billingInterval,
        priceAmount:
          value.priceAmount ??
          (value.billingInterval === "YEARLY"
            ? plan.yearlyPrice?.toString()
            : plan.monthlyPrice?.toString()),
        priceCurrency: value.priceCurrency ?? plan.priceCurrency,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        tenantId: value.tenantId,
        action: "subscription.plan_changed",
        entityId: subscription.id,
      },
    });
    return subscription;
  });
}

const subscriptionStatusInput = z.object({
  tenantId: z.string().min(1),
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"]),
});
export async function setSubscriptionStatus(actor: Actor, input: unknown) {
  requirePlatform(actor);
  const value = subscriptionStatusInput.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${value.tenantId} FOR UPDATE`;
    const current = await tx.subscription.findFirst({
      where: { tenantId: value.tenantId },
      orderBy: { startsAt: "desc" },
    });
    if (!current)
      throw new AccessError(404, "Kein aktuelles SaaS-Abonnement gefunden.");
    const trialEndsAt = new Date(Date.now() + 14 * 86400000);
    const data =
      value.status === "ACTIVE"
        ? { status: value.status, endsAt: null, trialEndsAt: null }
        : value.status === "TRIAL"
          ? { status: value.status, trialEndsAt, endsAt: trialEndsAt }
          : value.status === "CANCELED" || value.status === "SUSPENDED"
            ? { status: value.status, endsAt: new Date() }
            : { status: value.status };
    const result = await tx.subscription.update({
      where: { id: current.id },
      data,
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        tenantId: value.tenantId,
        action: "subscription.status_changed",
        entityId: current.id,
      },
    });
    return result;
  });
}

const trialExtensionInput = z.object({
  tenantId: z.string().min(1),
  days: z.number().int().min(1).max(365),
});
export async function extendTrial(actor: Actor, input: unknown) {
  requirePlatform(actor);
  const value = trialExtensionInput.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${value.tenantId} FOR UPDATE`;
    const current = await tx.subscription.findFirst({
      where: { tenantId: value.tenantId, status: "TRIAL" },
      orderBy: { startsAt: "desc" },
    });
    if (!current)
      throw new AccessError(
        409,
        "Die Subscription befindet sich nicht in einer Testphase.",
      );
    const trialEndsAt = new Date(
      Math.max(current.trialEndsAt?.getTime() ?? Date.now(), Date.now()) +
        value.days * 86400000,
    );
    const result = await tx.subscription.update({
      where: { id: current.id },
      data: { trialEndsAt, endsAt: trialEndsAt },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        tenantId: value.tenantId,
        action: "subscription.trial_extended",
        entityId: current.id,
      },
    });
    return result;
  });
}

const billingMetadataInput = z.object({
  tenantId: z.string().min(1),
  billingInterval: z.enum(["MONTHLY", "YEARLY"]),
  priceAmount: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/)
    .nullable(),
  priceCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  billingContactName: z.string().trim().max(160).nullable(),
  billingContactEmail: z.email().nullable(),
  billingContactCompany: z.string().trim().max(160).nullable(),
  billingContactAddress: z.string().trim().max(500).nullable(),
  externalBillingId: z.string().trim().max(200).nullable(),
});
export async function setBillingMetadata(actor: Actor, input: unknown) {
  requirePlatform(actor);
  const value = billingMetadataInput.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${value.tenantId} FOR UPDATE`;
    const current = await tx.subscription.findFirst({
      where: { tenantId: value.tenantId },
      orderBy: { startsAt: "desc" },
    });
    if (!current)
      throw new AccessError(404, "Kein aktuelles SaaS-Abonnement gefunden.");
    const { tenantId, ...metadata } = value;
    const result = await tx.subscription.update({
      where: { id: current.id },
      data: metadata,
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        tenantId,
        action: "subscription.billing_metadata_changed",
        entityId: current.id,
      },
    });
    return result;
  });
}

const overrideSchema = z.object({
  tenantId: z.string().min(1),
  feature: z.enum(featureKeys),
  enabled: z.boolean(),
});
export async function setFeatureOverride(actor: Actor, input: unknown) {
  requirePlatform(actor);
  const value = overrideSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${value.tenantId} FOR UPDATE`;
    const subscription = await getTenantEntitlements(value.tenantId, tx);
    if (subscription.plan.code !== "ENTERPRISE")
      throw new AccessError(
        409,
        "Individuelle Feature-Overrides sind Enterprise vorbehalten.",
      );
    const result = await tx.tenantFeatureOverride.upsert({
      where: {
        tenantId_feature: { tenantId: value.tenantId, feature: value.feature },
      },
      create: value,
      update: { enabled: value.enabled },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        tenantId: value.tenantId,
        action: "subscription.feature_override",
        entityId: value.tenantId,
      },
    });
    return result;
  });
}

const limitSchema = z.object({
  tenantId: z.string().min(1),
  maxProperties: z.number().int().min(0).max(unlimited).nullable().optional(),
  maxMeters: z.number().int().min(0).max(unlimited).nullable().optional(),
  maxUsers: z.number().int().min(0).max(unlimited).nullable().optional(),
  maxGateways: z.number().int().min(0).max(unlimited).nullable().optional(),
  maxBuildings: z.number().int().min(0).max(unlimited).nullable().optional(),
  maxUnits: z.number().int().min(0).max(unlimited).nullable().optional(),
  maxDevices: z.number().int().min(0).max(unlimited).nullable().optional(),
});
export async function setPlanOverride(actor: Actor, input: unknown) {
  requirePlatform(actor);
  const value = limitSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${value.tenantId} FOR UPDATE`;
    const subscription = await getTenantEntitlements(value.tenantId, tx);
    if (subscription.plan.code !== "ENTERPRISE")
      throw new AccessError(
        409,
        "Individuelle Limits sind Enterprise vorbehalten.",
      );
    const { tenantId, ...limits } = value;
    const result = await tx.tenantPlanOverride.upsert({
      where: { tenantId },
      create: { tenantId, ...limits },
      update: limits,
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        tenantId,
        action: "subscription.limits_changed",
        entityId: tenantId,
      },
    });
    return result;
  });
}

export { unlimited };
