import "server-only";
import { db } from "./db";
import { requirePlatform, tenantScope, type Actor } from "./policy";
import { liveHealth, metricsSnapshot } from "./observability";
import { AccessError } from "./policy";

export async function platformOverview(actor: Actor) {
  requirePlatform(actor);
  const [tenants, users, properties, gateways, devices, alerts, health] =
    await Promise.all([
      db.tenant.count(),
      db.user.count({ where: { active: true } }),
      db.property.count(),
      db.gateway.count(),
      db.device.count(),
      db.technicalAlert.count({ where: { active: true } }),
      liveHealth(),
    ]);
  const [onlineGateways, onlineDevices] = await Promise.all([
    db.gateway.count({
      where: {
        lastSeenAt: { gte: new Date(Date.now() - 60_000) },
        status: { not: "DISABLED" },
      },
    }),
    db.device.count({
      where: {
        lastSeenAt: { gte: new Date(Date.now() - 60_000) },
        status: { not: "DISABLED" },
      },
    }),
  ]);
  return {
    counts: {
      tenants,
      users,
      properties,
      gateways,
      devices,
      alerts,
      onlineGateways,
      offlineGateways: gateways - onlineGateways,
      onlineDevices,
      offlineDevices: devices - onlineDevices,
    },
    health,
    metrics: metricsSnapshot(),
  };
}

export async function listPlatformTenants(actor: Actor) {
  requirePlatform(actor);
  return db.tenant.findMany({
    orderBy: { name: "asc" },
    take: 200,
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          properties: true,
          gateways: true,
          devices: true,
          technicalAlerts: true,
        },
      },
    },
  });
}

export async function tenantSupport(actor: Actor, requested: string) {
  requirePlatform(actor);
  const tenantId = tenantScope(actor, requested);
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) throw new AccessError(404, "Mandant nicht gefunden.");
  const [users, gateways, devices, worker, alerts, audit] = await Promise.all([
    db.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        mfaEnabled: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    }),
    db.gateway.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        queueSize: true,
        queueWarning: true,
        quarantineSize: true,
      },
    }),
    db.device.findMany({
      where: { tenantId },
      select: {
        id: true,
        externalDeviceId: true,
        protocol: true,
        status: true,
        lastSeenAt: true,
        meter: { select: { serialNumber: true, type: true } },
        gateway: { select: { name: true } },
      },
    }),
    db.workerHealth.findUnique({ where: { tenantId } }),
    db.technicalAlert.findMany({
      where: { tenantId, active: true },
      orderBy: { openedAt: "desc" },
    }),
    db.auditEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        actorId: true,
        action: true,
        entityId: true,
        correlationId: true,
        createdAt: true,
      },
    }),
  ]);
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      action: "support.tenant_view",
      entityId: tenantId,
    },
  });
  return { tenant, users, gateways, devices, worker, alerts, audit };
}
