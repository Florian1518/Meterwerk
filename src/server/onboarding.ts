import "server-only";
import { db } from "./db";
import { requireManage, tenantScope, type Actor } from "./policy";
import { AccessError } from "./policy";

export type OnboardingStep = {
  id: string;
  title: string;
  complete: boolean;
  count?: number;
  href: string;
};

export async function getOnboardingStatus(
  actor: Actor,
  requested?: string | null,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const [tenant, counts, tariffs] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    }),
    db.$transaction([
      db.user.count({ where: { tenantId } }),
      db.property.count({ where: { tenantId } }),
      db.building.count({ where: { tenantId } }),
      db.unit.count({ where: { tenantId } }),
      db.gateway.count({ where: { tenantId } }),
      db.meter.count({ where: { tenantId } }),
    ]),
    db.tariff.count({ where: { tenantId } }),
  ]);
  if (!tenant) throw new AccessError(404, "Mandant nicht gefunden.");
  const [users, properties, buildings, units, gateways, meters] = counts;
  const steps: OnboardingStep[] = [
    {
      id: "tenant",
      title: "Mandant",
      complete: true,
      count: 1,
      href: "/tenants",
    },
    {
      id: "tenant-admin",
      title: "Tenant-Admin einladen",
      complete: users > 0,
      count: users,
      href: "/users",
    },
    {
      id: "property",
      title: "Erste Liegenschaft",
      complete: properties > 0,
      count: properties,
      href: "/properties",
    },
    {
      id: "building",
      title: "Gebäude",
      complete: buildings > 0,
      count: buildings,
      href: "/buildings",
    },
    {
      id: "unit",
      title: "Nutzungseinheit",
      complete: units > 0,
      count: units,
      href: "/units",
    },
    {
      id: "gateway",
      title: "Gateway",
      complete: gateways > 0,
      count: gateways,
      href: "/gateways",
    },
    {
      id: "meter",
      title: "Zähler",
      complete: meters > 0,
      count: meters,
      href: "/meters",
    },
    {
      id: "tariff",
      title: "Tarif",
      complete: tariffs > 0,
      count: tariffs,
      href: "/settings",
    },
    {
      id: "users",
      title: "Benutzer",
      complete: users > 1,
      count: users,
      href: "/users",
    },
  ];
  return {
    tenant,
    steps,
    completed: steps.filter((step) => step.complete).length,
    total: steps.length,
    readyForGoLive: steps.every((step) => step.complete),
  };
}

export async function markOnboardingLive(
  actor: Actor,
  requested?: string | null,
) {
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const status = await getOnboardingStatus(actor, tenantId);
  if (!status.readyForGoLive)
    throw new AccessError(409, "Onboarding ist noch nicht vollständig.");
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "tenant.onboarding.go_live",
      entityId: tenantId,
    },
  });
  return { tenantId, liveAt: new Date().toISOString() };
}
