import "server-only";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import {
  AccessError,
  propertyScope,
  requireManage,
  requirePlatform,
  tenantScope,
} from "./policy";
import type { Prisma } from "@/generated/prisma/client";
import {
  assertGatewayAssignment,
  lockGatewayTenant,
} from "./gateway-assignment";

export const lifecycleStatuses = [
  "NEW",
  "PROVISIONING",
  "ACTIVE",
  "OFFLINE",
  "MAINTENANCE",
  "DECOMMISSIONED",
  "FAILED",
] as const;
const transitions: Record<
  (typeof lifecycleStatuses)[number],
  readonly string[]
> = {
  NEW: ["PROVISIONING", "FAILED", "DECOMMISSIONED"],
  PROVISIONING: ["ACTIVE", "FAILED", "MAINTENANCE"],
  ACTIVE: ["OFFLINE", "MAINTENANCE", "DECOMMISSIONED", "FAILED"],
  OFFLINE: ["ACTIVE", "MAINTENANCE", "FAILED", "DECOMMISSIONED"],
  MAINTENANCE: ["PROVISIONING", "ACTIVE", "DECOMMISSIONED", "FAILED"],
  FAILED: ["PROVISIONING", "MAINTENANCE", "DECOMMISSIONED"],
  DECOMMISSIONED: [],
};
export function isAllowedLifecycleTransition(from: string, to: string) {
  return (transitions[from as keyof typeof transitions] ?? []).includes(to);
}

const jsonObject = z.record(z.string(), z.unknown()).default({});
const inputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    externalDeviceId: z.string().trim().min(1).max(120),
    serialNumber: z.string().trim().max(120).optional(),
    manufacturer: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(120),
    meterId: z.string().min(1),
    gatewayId: z.string().min(1).optional(),
    profileId: z.string().min(1).optional(),
    protocol: z.enum([
      "VIRTUAL",
      "REST",
      "MQTT",
      "MODBUS",
      "MBUS",
      "WMBUS",
      "LORAWAN",
      "VENDOR_API",
      "MODBUS_RTU",
      "MODBUS_TCP",
      "PULSE",
    ]),
    firmwareVersion: z.string().max(80).optional(),
    hardwareVersion: z.string().max(80).optional(),
    tags: z.array(z.string().trim().min(1).max(48)).max(64).default([]),
    notes: z.string().max(4000).default(""),
  })
  .strict();
const configSchema = z
  .object({
    pollingIntervalSeconds: z.number().int().min(1).max(86400).optional(),
    communication: jsonObject,
    registerMapping: z.record(z.string(), z.string()).default({}),
    units: z.record(z.string(), z.string()).default({}),
    scalingFactors: z.record(z.string(), z.number().finite()).default({}),
    thresholds: z.record(z.string(), z.number().finite()).default({}),
  })
  .strict();

function scope(
  actor: Awaited<ReturnType<typeof requireActor>>,
  requested?: string | null,
) {
  return { actor, tenantId: tenantScope(actor, requested) };
}
async function visibleDevice(
  id: string,
  actor: Awaited<ReturnType<typeof requireActor>>,
  requested?: string | null,
) {
  const { tenantId } = scope(actor, requested);
  const row = await db.device.findFirst({
    where: {
      id,
      tenantId,
      meter: {
        unit: { building: { property: propertyScope(actor, tenantId) } },
      },
    },
  });
  if (!row) throw new AccessError(404, "Gerät nicht gefunden.");
  return { row, tenantId };
}

export async function listDevices(
  raw: unknown = {},
  requested?: string | null,
) {
  const actor = await requireActor();
  const { tenantId } = scope(actor, requested);
  const value = z
    .object({
      q: z.string().trim().max(120).optional(),
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      status: z.enum(lifecycleStatuses).optional(),
      protocol: z.string().optional(),
      firmware: z.string().optional(),
      gatewayId: z.string().optional(),
      meterType: z.enum(["ELECTRICITY", "WATER", "GAS", "HEAT"]).optional(),
      meterId: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    })
    .parse(raw);
  const where: Prisma.DeviceWhereInput = {
    tenantId,
    meter: {
      type: value.meterType,
      unit: { building: { property: propertyScope(actor, tenantId) } },
    },
    manufacturer: value.manufacturer,
    model: value.model,
    lifecycleStatus: value.status,
    protocol: value.protocol as Prisma.EnumDeviceProtocolFilter | undefined,
    firmwareVersion: value.firmware
      ? { contains: value.firmware, mode: "insensitive" }
      : undefined,
    gatewayId: value.gatewayId,
    meterId: value.meterId,
  };
  if (value.q)
    where.OR = [
      { name: { contains: value.q, mode: "insensitive" } },
      { externalDeviceId: { contains: value.q, mode: "insensitive" } },
      { serialNumber: { contains: value.q, mode: "insensitive" } },
    ];
  const [items, total] = await db.$transaction([
    db.device.findMany({
      where,
      include: {
        meter: {
          select: {
            serialNumber: true,
            type: true,
            unit: {
              select: {
                name: true,
                building: {
                  select: { name: true, property: { select: { name: true } } },
                },
              },
            },
          },
        },
        gateway: { select: { id: true, name: true } },
        profile: {
          select: { id: true, manufacturer: true, model: true, version: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (value.page - 1) * value.pageSize,
      take: value.pageSize,
    }),
    db.device.count({ where }),
  ]);
  return {
    items,
    page: value.page,
    pageSize: value.pageSize,
    total,
    pages: Math.ceil(total / value.pageSize),
  };
}

/** Platform-only inventory query. Cross-tenant scope is derived from the session role. */
export async function listPlatformDevices(
  raw: unknown = {},
  requestedTenant?: string,
) {
  const actor = await requireActor();
  requirePlatform(actor);
  const value = z
    .object({
      q: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().min(1).max(100000).default(1),
    })
    .strict()
    .parse(raw);
  if (
    requestedTenant &&
    !(await db.tenant.findUnique({
      where: { id: requestedTenant },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Kunde nicht gefunden.");
  const where: Prisma.DeviceWhereInput = {
    ...(requestedTenant ? { tenantId: requestedTenant } : {}),
    ...(value.q
      ? {
          OR: [
            { name: { contains: value.q, mode: "insensitive" } },
            { externalDeviceId: { contains: value.q, mode: "insensitive" } },
            { serialNumber: { contains: value.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const pageSize = 25;
  const [items, total] = await db.$transaction([
    db.device.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (value.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        tenantId: true,
        name: true,
        externalDeviceId: true,
        lifecycleStatus: true,
        status: true,
        lastSeenAt: true,
        tenant: { select: { id: true, name: true } },
        meter: {
          select: {
            serialNumber: true,
            type: true,
          },
        },
        gateway: { select: { id: true, name: true } },
        profile: {
          select: { manufacturer: true, model: true, version: true },
        },
      },
    }),
    db.device.count({ where }),
  ]);
  return {
    items,
    page: value.page,
    pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getDeviceDetail(id: string, requested?: string | null) {
  const actor = await requireActor();
  const { tenantId } = await visibleDevice(id, actor, requested);
  return db.device.findFirstOrThrow({
    where: { id, tenantId },
    include: {
      meter: {
        include: {
          unit: { include: { building: { include: { property: true } } } },
        },
      },
      gateway: true,
      profile: true,
      credentials: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          lastUsedAt: true,
          revokedAt: true,
        },
      },
      configurationVersions: { orderBy: { version: "desc" }, take: 20 },
      maintenanceEvents: { orderBy: { createdAt: "desc" }, take: 20 },
      commands: { orderBy: { createdAt: "desc" }, take: 20 },
      readings: { orderBy: { timestamp: "desc" }, take: 10 },
    },
  });
}

export async function createDevice(raw: unknown, requested?: string | null) {
  const actor = await requireActor();
  requireManage(actor);
  const { tenantId } = scope(actor, requested);
  const value = inputSchema.parse(raw);
  const meter = await db.meter.findFirst({
    where: {
      id: value.meterId,
      tenantId,
      unit: { building: { property: propertyScope(actor, tenantId) } },
    },
    select: { id: true },
  });
  if (!meter) throw new AccessError(404, "Zähler nicht gefunden.");
  if (
    value.gatewayId &&
    !(await db.gateway.findFirst({
      where: { id: value.gatewayId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Gateway nicht gefunden.");
  if (
    value.profileId &&
    !(await db.deviceProfile.findFirst({
      where: { id: value.profileId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Device Profile nicht gefunden.");
  const row = await db.$transaction(async (tx) => {
    await lockGatewayTenant(tx, tenantId);
    if (value.gatewayId)
      await assertGatewayAssignment(
        tx,
        tenantId,
        value.gatewayId,
        value.meterId,
      );
    const created = await tx.device.create({
      data: {
        ...value,
        tenantId,
        tags: value.tags as Prisma.InputJsonValue,
        protocol: value.protocol,
        status: "MAINTENANCE",
        lifecycleStatus: "NEW",
        installedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "device.create",
        entityId: created.id,
      },
    });
    return created;
  });
  return row;
}

export async function updateDevice(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const { tenantId } = await visibleDevice(id, actor, requested);
  const value = inputSchema.partial().parse(raw);
  if (
    value.meterId &&
    !(await db.meter.findFirst({
      where: { id: value.meterId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Zähler nicht gefunden.");
  if (
    value.gatewayId &&
    !(await db.gateway.findFirst({
      where: { id: value.gatewayId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Gateway nicht gefunden.");
  if (
    value.profileId &&
    !(await db.deviceProfile.findFirst({
      where: { id: value.profileId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Device Profile nicht gefunden.");
  const data: Prisma.DeviceUpdateInput = {
    ...value,
    tags: value.tags as Prisma.InputJsonValue | undefined,
  };
  return db.$transaction(async (tx) => {
    await lockGatewayTenant(tx, tenantId);
    const current = await tx.device.findFirstOrThrow({
      where: { id, tenantId },
      include: { modbusConfig: true },
    });
    const gatewayId = value.gatewayId ?? current.gatewayId;
    if (
      gatewayId &&
      (value.gatewayId !== undefined || value.meterId !== undefined)
    )
      await assertGatewayAssignment(
        tx,
        tenantId,
        gatewayId,
        value.meterId ?? current.meterId,
        id,
      );
    // Prevent lifecycle/decommission races while changing the association.
    await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "id"=${id} AND "tenantId"=${tenantId} FOR UPDATE`;
    const locked = await tx.device.findFirstOrThrow({
      where: { id, tenantId },
    });
    if (
      locked.lifecycleStatus === "DECOMMISSIONED" &&
      (value.gatewayId !== undefined || value.meterId !== undefined)
    )
      throw new AccessError(
        409,
        "Stillgelegtes Gerät kann nicht umgeordnet werden.",
      );
    if (
      current.modbusConfig &&
      ["gatewayId", "meterId", "protocol", "profileId"].some((key) => {
        const field = key as "gatewayId" | "meterId" | "protocol" | "profileId";
        return value[field] !== undefined && value[field] !== current[field];
      })
    )
      throw new AccessError(
        409,
        "Konfigurierte Modbus-Geräte nur über den Inbetriebnahme-Assistenten neu zuordnen oder konfigurieren; technische Verifikation muss erneuert werden.",
      );
    const updated = await tx.device.update({ where: { id }, data });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "device.update",
        entityId: id,
        details: { fields: Object.keys(value) },
      },
    });
    return updated;
  });
}

export async function changeDeviceLifecycle(
  id: string,
  next: string,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const { tenantId } = await visibleDevice(id, actor, requested);
  const target = z.enum(lifecycleStatuses).parse(next);
  return db.$transaction(async (tx) => {
    await lockLifecycleDevices(tx, tenantId, [id]);
    const row = await tx.device.findFirstOrThrow({ where: { id, tenantId } });
    const updated = await applyLifecycle(tx, tenantId, row, target);
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "device.lifecycle.change",
        entityId: id,
        details: { from: row.lifecycleStatus, to: target },
      },
    });
    return updated;
  });
}

async function lockLifecycleDevices(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ids: string[],
) {
  // Match the Gateway -> Device lock order used by Modbus and ingestion.
  await tx.$queryRaw`SELECT "id" FROM "Gateway" WHERE "tenantId"=${tenantId} AND "id" IN (SELECT "gatewayId" FROM "Device" WHERE "tenantId"=${tenantId} AND "id" = ANY(${ids})) ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Device" WHERE "tenantId"=${tenantId} AND "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
}

async function applyLifecycle(
  tx: Prisma.TransactionClient,
  tenantId: string,
  row: { id: string; lifecycleStatus: string },
  target: (typeof lifecycleStatuses)[number],
) {
  if (!isAllowedLifecycleTransition(row.lifecycleStatus, target))
    throw new AccessError(
      409,
      `Statuswechsel ${row.lifecycleStatus} → ${target} nicht erlaubt.`,
    );
  if (target === "DECOMMISSIONED") {
    await tx.deviceCredential.updateMany({
      where: { tenantId, deviceId: row.id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await tx.modbusConfiguration.updateMany({
      where: { tenantId, deviceId: row.id },
      data: { state: "DISABLED", pollingEnabled: false },
    });
    await tx.gatewayCommand.updateMany({
      where: { tenantId, deviceId: row.id, status: "PENDING" },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
  }
  return tx.device.update({
    where: { id: row.id },
    data: {
      lifecycleStatus: target,
      ...(target === "DECOMMISSIONED" ? { status: "DISABLED" as const } : {}),
    },
  });
}

export async function saveDeviceConfiguration(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const { tenantId } = await visibleDevice(id, actor, requested);
  const config = configSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const last = await tx.deviceConfigurationVersion.findFirst({
      where: { deviceId: id, tenantId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    const row = await tx.deviceConfigurationVersion.create({
      data: {
        tenantId,
        deviceId: id,
        version,
        config: config as Prisma.InputJsonValue,
        createdBy: actor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "device.configuration.version.create",
        entityId: id,
        details: { version },
      },
    });
    return row;
  });
}

export async function bulkDeviceAction(
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const { tenantId } = scope(actor, requested);
  const value = z
    .object({
      ids: z.array(z.string().min(1)).min(1).max(100),
      action: z.enum([
        "SET_TAGS",
        "SET_STATUS",
        "MAINTENANCE",
        "ASSIGN_PROFILE",
      ]),
      tags: z.array(z.string().min(1).max(48)).max(64).optional(),
      status: z.enum(lifecycleStatuses).optional(),
      profileId: z.string().min(1).optional(),
    })
    .strict()
    .parse(raw);
  const rows = await db.device.findMany({
    where: { id: { in: value.ids }, tenantId },
    select: { id: true, lifecycleStatus: true },
  });
  if (rows.length !== value.ids.length)
    throw new AccessError(
      404,
      "Mindestens ein Device gehört nicht zum Mandanten.",
    );
  if (
    value.action === "ASSIGN_PROFILE" &&
    (!value.profileId ||
      !(await db.deviceProfile.findFirst({
        where: { id: value.profileId, tenantId },
        select: { id: true },
      })))
  )
    throw new AccessError(404, "Device Profile nicht gefunden.");
  const target =
    value.action === "MAINTENANCE"
      ? "MAINTENANCE"
      : value.action === "SET_STATUS"
        ? value.status
        : undefined;
  if (value.action === "SET_STATUS" && !target)
    throw new AccessError(400, "Status fehlt.");
  if (
    target &&
    rows.some(
      (row) => !isAllowedLifecycleTransition(row.lifecycleStatus, target),
    )
  )
    throw new AccessError(
      409,
      "Mindestens ein Statuswechsel ist nicht erlaubt.",
    );
  return db.$transaction(async (tx) => {
    if (target) await lockLifecycleDevices(tx, tenantId, value.ids);
    const currentRows = await tx.device.findMany({
      where: { tenantId, id: { in: value.ids } },
      select: { id: true, lifecycleStatus: true },
    });
    if (currentRows.length !== value.ids.length)
      throw new AccessError(404, "Device nicht gefunden.");
    for (const row of currentRows) {
      const data: Prisma.DeviceUpdateInput =
        value.action === "SET_TAGS"
          ? { tags: (value.tags ?? []) as Prisma.InputJsonValue }
          : value.action === "ASSIGN_PROFILE"
            ? {
                profile: {
                  connect: { id_tenantId: { id: value.profileId!, tenantId } },
                },
              }
            : value.action === "MAINTENANCE"
              ? { lifecycleStatus: "MAINTENANCE" }
              : { lifecycleStatus: target };
      if (target) await applyLifecycle(tx, tenantId, row, target);
      else await tx.device.update({ where: { id: row.id }, data });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: actor.id,
          action: `device.bulk.${value.action.toLowerCase()}`,
          entityId: row.id,
          details: {
            from: row.lifecycleStatus,
            to: target,
          },
        },
      });
    }
    return { updated: rows.length };
  });
}
