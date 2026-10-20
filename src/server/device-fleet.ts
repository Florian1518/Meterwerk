import "server-only";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import {
  AccessError,
  propertyScope,
  requireManage,
  tenantScope,
} from "./policy";
import { newDeviceToken, hashDeviceToken } from "./device-auth";
import {
  assertGatewayAssignment,
  lockGatewayTenant,
} from "./gateway-assignment";
import type { Prisma } from "@/generated/prisma/client";

export const commandTypes = [
  "CONFIG_REFRESH",
  "STATUS_REQUEST",
  "RESTART_REQUEST",
  "DIAGNOSTICS_REQUEST",
  "FIRMWARE_CHECK",
] as const;
export const commandStatuses = [
  "QUEUED",
  "SENT",
  "ACKNOWLEDGED",
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
  "CANCELED",
] as const;

export type HealthResult = {
  status: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
  reasons: string[];
};
export function evaluateDeviceHealth(
  input: {
    lastContact: Date | null;
    deviceStatus: string;
    errorRate: number | null;
    missingMeasurements: boolean;
    credentialStatus: string | null;
    provisioningStatus: string | null;
    firmwareUpdateStatus: string | null;
    openAlarms: number;
    configurationError: boolean;
    maintenance: boolean;
  },
  now = new Date(),
): HealthResult {
  if (input.maintenance)
    return { status: "WARNING", reasons: ["Wartungsfenster aktiv"] };
  if (!input.lastContact)
    return { status: "UNKNOWN", reasons: ["Noch kein Kontakt"] };
  const age = now.getTime() - input.lastContact.getTime();
  const reasons: string[] = [];
  if (
    input.deviceStatus === "DISABLED" ||
    input.credentialStatus === "REVOKED" ||
    input.configurationError
  )
    reasons.push("Kritischer Gerätefehler");
  if (age > 24 * 3600_000 || input.openAlarms > 0)
    reasons.push("Kontakt älter als 24 Stunden oder offene Alarme");
  if (
    (input.errorRate ?? 0) >= 0.5 ||
    input.provisioningStatus === "FAILED" ||
    input.firmwareUpdateStatus === "FAILED"
  )
    reasons.push("Hohe Fehler- oder Update-Fehlerrate");
  if (
    input.missingMeasurements ||
    age > 2 * 3600_000 ||
    input.deviceStatus === "OFFLINE" ||
    input.credentialStatus === "EXPIRED"
  )
    reasons.push("Messwerte oder Kontakt unvollständig");
  if (!reasons.length)
    return { status: "HEALTHY", reasons: ["Kontakt und Daten aktuell"] };
  if (reasons.some((r) => r.includes("Kritischer") || r.includes("Hohe")))
    return { status: "CRITICAL", reasons };
  return { status: "WARNING", reasons };
}

async function access(id: string, requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const device = await db.device.findFirst({
    where: {
      id,
      tenantId,
      meter: {
        unit: { building: { property: propertyScope(actor, tenantId) } },
      },
    },
    include: {
      meter: {
        include: {
          alarms: { where: { status: "OPEN" }, select: { id: true } },
        },
      },
      credentials: {
        select: { status: true, lastUsedAt: true, revokedAt: true },
      },
      commands: { orderBy: { createdAt: "desc" }, take: 10 },
      configurationVersions: { orderBy: { version: "desc" }, take: 1 },
      maintenanceWindows: {
        where: { startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
      },
      diagnostic: true,
      readings: { orderBy: { timestamp: "desc" }, take: 1 },
      maintenanceEvents: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!device) throw new AccessError(404, "Device nicht gefunden.");
  return { actor, tenantId, device };
}

export async function deviceHealth(id: string, requested?: string | null) {
  const { device } = await access(id, requested);
  const lastContact = device.lastSeenAt;
  const credential = device.credentials[0];
  const result = evaluateDeviceHealth({
    lastContact,
    deviceStatus: device.status,
    errorRate: device.diagnostic
      ? device.diagnostic.errors /
        Math.max(1, device.diagnostic.successes + device.diagnostic.errors)
      : null,
    missingMeasurements: !!device.diagnostic?.lastError,
    credentialStatus: credential?.status ?? null,
    provisioningStatus: device.commands[0]?.status ?? null,
    firmwareUpdateStatus: device.firmwareUpdateStatus,
    openAlarms: device.meter.alarms.length,
    configurationError: device.diagnostic?.lastError?.length ? true : false,
    maintenance: device.maintenanceWindows.length > 0,
  });
  return { deviceId: id, ...result };
}

export async function fleetOverview(
  raw: unknown = {},
  requested?: string | null,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const value = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      protocol: z.string().optional(),
      status: z.string().optional(),
      firmware: z.string().optional(),
      gatewayId: z.string().optional(),
      meterType: z.string().optional(),
    })
    .parse(raw);
  const where: Prisma.DeviceWhereInput = {
    tenantId,
    manufacturer: value.manufacturer,
    model: value.model,
    protocol: value.protocol as Prisma.EnumDeviceProtocolFilter | undefined,
    lifecycleStatus: value.status as
      | Prisma.EnumDeviceLifecycleStatusFilter
      | undefined,
    firmwareVersion: value.firmware
      ? { contains: value.firmware, mode: "insensitive" }
      : undefined,
    gatewayId: value.gatewayId,
    meter: {
      type: value.meterType as Prisma.EnumMeterTypeFilter | undefined,
      unit: { building: { property: propertyScope(actor, tenantId) } },
    },
  };
  const [items, total, grouped] = await db.$transaction([
    db.device.findMany({
      where,
      include: {
        meter: {
          select: {
            alarms: { where: { status: "OPEN" }, select: { id: true } },
          },
        },
        credentials: { select: { status: true } },
        commands: { orderBy: { createdAt: "desc" }, take: 1 },
        maintenanceWindows: {
          where: { startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (value.page - 1) * value.pageSize,
      take: value.pageSize,
    }),
    db.device.count({ where }),
    db.device.groupBy({
      by: ["status"],
      where,
      orderBy: { status: "asc" },
      _count: { _all: true },
    }),
  ]);
  const health = await Promise.all(
    items.map((d) => deviceHealth(d.id, tenantId)),
  );
  const counts = Object.fromEntries(
    grouped.map((g) => [
      g.status,
      (g._count as { _all?: number } | undefined)?._all ?? 0,
    ]),
  );
  return {
    items: items.map((d, i) => ({ ...d, health: health[i] })),
    total,
    page: value.page,
    pageSize: value.pageSize,
    pages: Math.ceil(total / value.pageSize),
    counts,
  };
}

export async function deviceDiagnostics(id: string, requested?: string | null) {
  const { device } = await access(id, requested);
  const health = await deviceHealth(id, requested);
  return {
    health,
    lastContact: device.lastSeenAt,
    lastMeasurement: device.readings?.[0] ?? null,
    events: device.commands,
    communication: device.diagnostic,
    provisioning: device.commands[0] ?? null,
    credentials: device.credentials,
    firmware: {
      current: device.firmwareVersion,
      desired: device.desiredFirmwareVersion,
      status: device.firmwareUpdateStatus,
      error: device.firmwareError,
    },
    configuration: device.configurationVersions[0] ?? null,
    alarms: device.meter.alarms,
    maintenance: device.maintenanceEvents,
  };
}

export async function queueDeviceCommand(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const { tenantId, device } = await access(id, requested);
  const value = z
    .object({
      action: z.enum(commandTypes),
      expiresAt: z.iso.datetime().optional(),
    })
    .strict()
    .parse(raw);
  const command = await db.$transaction(async (tx) => {
    await lockGatewayTenant(tx, tenantId);
    const current = await tx.device.findFirst({
      where: { id, tenantId },
      select: { id: true, gatewayId: true, meterId: true },
    });
    if (!current) throw new AccessError(404, "Device nicht gefunden.");
    if (!current.gatewayId)
      throw new AccessError(409, "Device ist keinem Gateway zugeordnet.");
    await assertGatewayAssignment(
      tx,
      tenantId,
      current.gatewayId,
      current.meterId,
      id,
    );
    const row = await tx.gatewayCommand.create({
      data: {
        tenantId,
        gatewayId: current.gatewayId,
        deviceId: id,
        action: value.action,
        revision: device.configurationVersions[0]?.version ?? 0,
        status: "QUEUED",
        expiresAt: value.expiresAt
          ? new Date(value.expiresAt)
          : new Date(Date.now() + 3600_000),
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "device.command.queue",
        entityId: row.id,
        details: { command: value.action },
      },
    });
    return row;
  });
  return command;
}

export async function createFirmwareRollout(
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const value = z
    .object({
      targetVersion: z.string().min(1).max(80),
      deviceIds: z.array(z.string()).min(1).max(1000),
      batchSize: z.number().int().min(1).max(100).default(1),
      maxParallel: z.number().int().min(1).max(100).default(1),
      canarySize: z.number().int().min(0).max(100).default(0),
      pauseThreshold: z.number().min(0).max(1).default(0.25),
      rollbackVersion: z.string().optional(),
      windowStart: z.iso.datetime().optional(),
      windowEnd: z.iso.datetime().optional(),
    })
    .strict()
    .parse(raw);
  const devices = await db.device.findMany({
    where: { id: { in: value.deviceIds }, tenantId },
    select: { id: true },
  });
  if (devices.length !== value.deviceIds.length)
    throw new AccessError(404, "Device gehört nicht zum Mandanten.");
  return db.$transaction(async (tx) => {
    const rollout = await tx.firmwareRollout.create({
      data: {
        tenantId,
        targetVersion: value.targetVersion,
        batchSize: value.batchSize,
        maxParallel: value.maxParallel,
        canarySize: value.canarySize,
        pauseThreshold: value.pauseThreshold,
        rollbackVersion: value.rollbackVersion,
        windowStart: value.windowStart ? new Date(value.windowStart) : null,
        windowEnd: value.windowEnd ? new Date(value.windowEnd) : null,
        createdBy: actor.id,
        criteria: { deviceIds: value.deviceIds },
      },
    });
    await tx.firmwareRolloutTarget.createMany({
      data: devices.map((d) => ({
        tenantId,
        rolloutId: rollout.id,
        deviceId: d.id,
      })),
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "firmware-rollout.create",
        entityId: rollout.id,
      },
    });
    return rollout;
  });
}

export async function createMaintenanceWindow(
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const value = z
    .object({
      deviceId: z.string().optional(),
      gatewayId: z.string().optional(),
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
      reason: z.string().min(1).max(200),
      comment: z.string().max(2000).default(""),
    })
    .strict()
    .parse(raw);
  if (!value.deviceId && !value.gatewayId)
    throw new AccessError(400, "Device oder Gateway erforderlich.");
  if (
    value.deviceId &&
    !(await db.device.findFirst({
      where: { id: value.deviceId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Device nicht gefunden.");
  if (
    value.gatewayId &&
    !(await db.gateway.findFirst({
      where: { id: value.gatewayId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Gateway nicht gefunden.");
  return db.$transaction(async (tx) => {
    const row = await tx.maintenanceWindow.create({
      data: {
        tenantId,
        deviceId: value.deviceId,
        gatewayId: value.gatewayId,
        startsAt: new Date(value.startsAt),
        endsAt: new Date(value.endsAt),
        reason: value.reason,
        comment: value.comment,
        createdBy: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "maintenance-window.create",
        entityId: row.id,
      },
    });
    return row;
  });
}

export async function rotateDeviceCredential(
  id: string,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const { tenantId } = await access(id, requested);
  const token = newDeviceToken();
  const row = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id"=${id} AND "tenantId"=${tenantId} FOR UPDATE`;
    const current = await tx.device.findFirstOrThrow({
      where: { id, tenantId },
    });
    if (current.lifecycleStatus === "DECOMMISSIONED")
      throw new AccessError(409, "Device ist außer Betrieb.");
    await tx.deviceCredential.updateMany({
      where: { tenantId, deviceId: id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const created = await tx.deviceCredential.create({
      data: { tenantId, deviceId: id, tokenHash: hashDeviceToken(token) },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "device.credential.rotate",
        entityId: created.id,
      },
    });
    return created;
  });
  return { credentialId: row.id, token };
}

export async function emitFleetNotification(
  tenantId: string,
  kind: string,
  entityId: string,
  details: Prisma.InputJsonValue = {},
) {
  const existing = await db.auditEvent.findFirst({
    where: {
      tenantId,
      action: `notification.${kind}`,
      entityId,
      createdAt: { gte: new Date(Date.now() - 3600_000) },
    },
    select: { id: true },
  });
  if (existing) return { deduplicated: true };
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: "system",
      action: `notification.${kind}`,
      entityId,
      details,
    },
  });
  return { deduplicated: false };
}
