import "server-only";
import { db } from "./db";
import { requireManage, tenantScope } from "./policy";
import { modbusConfigSchema, offlineAfter } from "@/lib/modbus/contracts";

export async function reconcileAlerts(tenantId: string) {
  const now = Date.now();
  const [health, gateways, devices] = await Promise.all([
    db.workerHealth.findUnique({ where: { tenantId } }),
    db.gateway.findMany({
      where: { tenantId, status: { notIn: ["DISABLED", "MAINTENANCE"] } },
    }),
    db.device.findMany({
      where: {
        tenantId,
        gatewayId: { not: null },
        status: { notIn: ["DISABLED", "MAINTENANCE"] },
      },
      include: { diagnostic: true, modbusConfig: true },
    }),
  ]);
  const conditions: { kind: string; entityId: string; active: boolean }[] = [];
  const alive = !!health && now - health.heartbeatAt.getTime() < 30000;
  conditions.push({
    kind: "INGESTION_OFFLINE",
    entityId: "worker",
    active: !alive,
  });
  conditions.push({
    kind: "MQTT_CONNECTION",
    entityId: "worker",
    active:
      alive &&
      !health!.mqttConnected &&
      now - (health!.mqttDisconnectedAt?.getTime() ?? now) >= 10000,
  });
  conditions.push({
    kind: "INGESTION_ERROR",
    entityId: "worker",
    active: alive && health!.errorStreak >= 3,
  });
  for (const g of gateways) {
    conditions.push({
      kind: "GATEWAY_OFFLINE",
      entityId: g.id,
      active: !g.lastSeenAt || now - g.lastSeenAt.getTime() > 30000,
    });
    conditions.push({
      kind: "QUEUE_BACKLOG",
      entityId: g.id,
      active: g.queueWarning || g.quarantineSize > 0 || g.queueDropped > 0,
    });
  }
  for (const d of devices) {
    const polling = !d.modbusConfig || d.modbusConfig.pollingEnabled;
    const grace = d.modbusConfig
      ? offlineAfter(modbusConfigSchema.parse(d.modbusConfig.configuration))
      : 30000;
    conditions.push({
      kind: "DEVICE_OFFLINE",
      entityId: d.id,
      active:
        polling && (!d.lastSeenAt || now - d.lastSeenAt.getTime() > grace),
    });
    conditions.push({
      kind: "MODBUS_ERROR",
      entityId: d.id,
      active: polling && (d.diagnostic?.consecutiveErrors ?? 0) >= 3,
    });
    conditions.push({
      kind: "INVALID_MEASUREMENT",
      entityId: d.id,
      active:
        polling &&
        d.diagnostic?.lastError === "UNREALISTIC" &&
        d.diagnostic.consecutiveErrors >= 3,
    });
  }
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${tenantId} FOR UPDATE`;
    for (const c of conditions) {
      const where = {
        tenantId_kind_entityId: {
          tenantId,
          kind: c.kind,
          entityId: c.entityId,
        },
      };
      const old = await tx.technicalAlert.findUnique({ where });
      if ((!old && !c.active) || old?.active === c.active) continue;
      await tx.technicalAlert.upsert({
        where,
        create: { tenantId, ...c },
        update: {
          active: c.active,
          resolvedAt: c.active ? null : new Date(),
          ...(c.active
            ? { openedAt: new Date(), occurrences: { increment: 1 } }
            : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: "monitor",
          entityId: c.entityId,
          action: `technical.${c.kind.toLowerCase()}.${c.active ? "opened" : "resolved"}`,
        },
      });
    }
    const expected = new Set(conditions.map((c) => `${c.kind}:${c.entityId}`));
    const obsolete = await tx.technicalAlert.findMany({
      where: { tenantId, active: true },
    });
    for (const alert of obsolete)
      if (!expected.has(`${alert.kind}:${alert.entityId}`)) {
        await tx.technicalAlert.update({
          where: { id: alert.id },
          data: { active: false, resolvedAt: new Date() },
        });
        await tx.auditEvent.create({
          data: {
            tenantId,
            actorId: "monitor",
            entityId: alert.entityId,
            action: `technical.${alert.kind.toLowerCase()}.resolved`,
          },
        });
      }
  });
}
export async function systemStatus(requested?: string | null) {
  const { requireActor } = await import("./auth");
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  await db.$queryRaw`SELECT 1`;
  await reconcileAlerts(tenantId);
  const [worker, gateways, devices, alerts] = await Promise.all([
    db.workerHealth.findUnique({ where: { tenantId } }),
    db.gateway.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        firmwareVersion: true,
        queueSize: true,
        queueWarning: true,
        quarantineSize: true,
        queueDropped: true,
      },
    }),
    db.device.findMany({
      where: { tenantId, gatewayId: { not: null } },
      select: {
        id: true,
        model: true,
        status: true,
        lastSeenAt: true,
        modbusConfig: { select: { configuration: true } },
        diagnostic: {
          select: {
            lastSuccessAt: true,
            lastPollAt: true,
            successes: true,
            errors: true,
            lastError: true,
          },
        },
        telemetry: {
          take: 1,
          orderBy: { timestamp: "desc" },
          select: { timestamp: true },
        },
      },
    }),
    db.technicalAlert.findMany({
      where: { tenantId, active: true },
      orderBy: { openedAt: "desc" },
    }),
  ]);
  const alive = !!worker && Date.now() - worker.heartbeatAt.getTime() < 30000;
  return {
    tenantId,
    asOf: new Date().toISOString(),
    postgres: true,
    mqtt: alive && worker!.mqttConnected,
    ingestion: alive && worker!.subscribed,
    worker,
    gateways: gateways.map((g) => ({
      ...g,
      status:
        !["DISABLED", "MAINTENANCE"].includes(g.status) &&
        (!g.lastSeenAt || Date.now() - g.lastSeenAt.getTime() > 30000)
          ? "OFFLINE"
          : g.status,
    })),
    devices: devices.map((d) => {
      const { modbusConfig, ...safe } = d;
      const grace = modbusConfig
        ? offlineAfter(modbusConfigSchema.parse(modbusConfig.configuration))
        : 30000;
      return {
        ...safe,
        status:
          !["DISABLED", "MAINTENANCE"].includes(d.status) &&
          (!d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > grace)
            ? "OFFLINE"
            : d.status,
      };
    }),
    alerts,
  };
}
export async function recordWorkerHealth(
  mqttConnected: boolean,
  subscribed: boolean,
  errorStreak: number,
  lastIngestionAt: Date | null,
) {
  const tenants = await db.tenant.findMany({ select: { id: true } });
  for (const { id: tenantId } of tenants) {
    const previous = await db.workerHealth.findUnique({
      where: { tenantId },
      select: { mqttDisconnectedAt: true },
    });
    const data = {
      heartbeatAt: new Date(),
      mqttConnected,
      mqttDisconnectedAt: mqttConnected
        ? null
        : (previous?.mqttDisconnectedAt ?? new Date()),
      subscribed,
      errorStreak,
      lastIngestionAt,
    };
    await db.workerHealth.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    await reconcileAlerts(tenantId);
  }
}
