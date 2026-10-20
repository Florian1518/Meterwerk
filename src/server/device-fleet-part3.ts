import "server-only";
import { z } from "zod";
import { db } from "./db";
import {
  assertGatewayAssignment,
  lockGatewayTenant,
} from "./gateway-assignment";
import { requireActor } from "./auth";
import {
  AccessError,
  propertyScope,
  requireManage,
  tenantScope,
} from "./policy";
import type { Prisma } from "@/generated/prisma/client";

export function evaluateCompliance(input: {
  firmwareVersion: string | null;
  desiredFirmwareVersion: string | null;
  profileExpected: boolean;
  configCurrent: boolean;
  credentialValid: boolean;
  provisioningOk: boolean;
}): {
  status: "COMPLIANT" | "WARNING" | "NON_COMPLIANT" | "UNKNOWN";
  deviations: string[];
} {
  const deviations: string[] = [];
  if (!input.firmwareVersion || !input.desiredFirmwareVersion)
    deviations.push("Firmwareziel oder Ist-Version fehlt");
  else if (input.firmwareVersion !== input.desiredFirmwareVersion)
    deviations.push("Firmware veraltet");
  if (!input.profileExpected)
    deviations.push("Device Profile fehlt oder weicht ab");
  if (!input.configCurrent) deviations.push("Konfiguration nicht aktuell");
  if (!input.credentialValid)
    deviations.push("Credential ungültig oder widerrufen");
  if (!input.provisioningOk) deviations.push("Provisioning nicht erfolgreich");
  if (!input.firmwareVersion && !input.desiredFirmwareVersion)
    return { status: "UNKNOWN", deviations };
  if (
    deviations.some((d) => d.includes("ungültig") || d.includes("Provisioning"))
  )
    return { status: "NON_COMPLIANT", deviations };
  return deviations.length
    ? { status: "WARNING", deviations }
    : { status: "COMPLIANT", deviations: ["Keine Abweichung"] };
}

export async function deviceCompliance(id: string, requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const d = await db.device.findFirst({
    where: {
      id,
      tenantId,
      meter: {
        unit: { building: { property: propertyScope(actor, tenantId) } },
      },
    },
    include: {
      profile: true,
      credentials: { where: { status: "ACTIVE" }, take: 1 },
      commands: { orderBy: { createdAt: "desc" }, take: 1 },
      configurationVersions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!d) throw new AccessError(404, "Device nicht gefunden.");
  return {
    deviceId: id,
    ...evaluateCompliance({
      firmwareVersion: d.firmwareVersion,
      desiredFirmwareVersion: d.desiredFirmwareVersion,
      profileExpected: !!d.profile,
      configCurrent: d.configurationVersions.length > 0,
      credentialValid: d.credentials.length > 0,
      provisioningOk: d.commands[0]?.status === "SUCCEEDED",
    }),
  };
}

export async function createDeviceGroup(
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const value = z
    .object({
      name: z.string().trim().min(1).max(120),
      description: z.string().max(2000).default(""),
      dynamic: z.boolean().default(false),
      filter: z
        .object({
          manufacturer: z.string().optional(),
          model: z.string().optional(),
          profileId: z.string().optional(),
          firmware: z.string().optional(),
          protocol: z.string().optional(),
          status: z.string().optional(),
          propertyId: z.string().optional(),
          tags: z.array(z.string()).max(50).optional(),
        })
        .strict()
        .default({}),
      tags: z.array(z.string()).max(50).default([]),
      deviceIds: z.array(z.string()).max(1000).default([]),
    })
    .strict()
    .parse(raw);
  if (value.dynamic && value.deviceIds.length)
    throw new AccessError(
      400,
      "Dynamische Gruppen verwenden Filter statt statischer IDs.",
    );
  const devices = value.deviceIds.length
    ? await db.device.findMany({
        where: { id: { in: value.deviceIds }, tenantId },
        select: { id: true },
      })
    : [];
  if (devices.length !== value.deviceIds.length)
    throw new AccessError(404, "Device gehört nicht zum Mandanten.");
  return db.$transaction(async (tx) => {
    const group = await tx.deviceGroup.create({
      data: {
        tenantId,
        name: value.name,
        description: value.description,
        dynamic: value.dynamic,
        filter: value.filter as Prisma.InputJsonValue,
        tags: value.tags as Prisma.InputJsonValue,
        createdBy: actor.id,
      },
    });
    if (devices.length)
      await tx.deviceGroupMember.createMany({
        data: devices.map((d) => ({
          tenantId,
          groupId: group.id,
          deviceId: d.id,
        })),
      });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "device-group.create",
        entityId: group.id,
      },
    });
    return group;
  });
}

export async function processScheduledRollouts(limit = 20) {
  const rollouts = await db.firmwareRollout.findMany({
    where: { status: { in: ["SCHEDULED", "RUNNING"] } },
    include: { targets: { where: { status: "PENDING" }, take: limit } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let processed = 0;
  for (const rollout of rollouts) {
    if (!rollout.targets.length) {
      await db.firmwareRollout.update({
        where: { id: rollout.id },
        data: { status: "COMPLETED" },
      });
      continue;
    }
    await db.$transaction(async (tx) => {
      await tx.firmwareRollout.update({
        where: { id: rollout.id },
        data: { status: "RUNNING" },
      });
      for (const target of rollout.targets) {
        await lockGatewayTenant(tx, rollout.tenantId);
        const device = await tx.device.findFirst({
          where: { id: target.deviceId, tenantId: rollout.tenantId },
          select: { id: true, gatewayId: true, meterId: true },
        });
        if (!device?.gatewayId)
          throw new Error("Firmware-Rollout-Ziel hat kein Gateway.");
        await assertGatewayAssignment(
          tx,
          rollout.tenantId,
          device.gatewayId,
          device.meterId,
          device.id,
        );
        await tx.gatewayCommand.create({
          data: {
            tenantId: rollout.tenantId,
            gatewayId: device.gatewayId,
            deviceId: target.deviceId,
            action: "FIRMWARE_CHECK",
            revision: 0,
            status: "QUEUED",
            expiresAt: new Date(Date.now() + 3600_000),
          },
        });
        await tx.firmwareRolloutTarget.update({
          where: { id: target.id },
          data: { status: "QUEUED", attemptedAt: new Date() },
        });
        processed++;
      }
    });
  }
  return { processed };
}

export const rolloutActionSchema = z
  .object({ action: z.enum(["RESUME", "CANCEL", "PAUSE"]) })
  .strict();
export async function updateRollout(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const value = rolloutActionSchema.parse(raw);
  const rollout = await db.firmwareRollout.findFirst({
    where: { id, tenantId },
  });
  if (!rollout) throw new AccessError(404, "Rollout nicht gefunden.");
  const status =
    value.action === "RESUME"
      ? "RUNNING"
      : value.action === "CANCEL"
        ? "CANCELED"
        : "PAUSED";
  return db.$transaction(async (tx) => {
    const row = await tx.firmwareRollout.update({
      where: { id },
      data: { status },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: `firmware-rollout.${value.action.toLowerCase()}`,
        entityId: id,
      },
    });
    return row;
  });
}

export async function gatewayHealth(id: string, requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const visibleDevices = {
    tenantId,
    meter: { unit: { building: { property: propertyScope(actor, tenantId) } } },
  };
  const g = await db.gateway.findFirst({
    where: {
      id,
      tenantId,
      ...(actor.role === "USER" ? { devices: { some: visibleDevices } } : {}),
    },
    include: {
      devices: { where: visibleDevices, select: { id: true, status: true } },
      credentials: { where: { status: "ACTIVE" }, select: { id: true } },
      commands: {
        where: {
          tenantId,
          device: visibleDevices,
          status: { in: ["FAILED", "QUEUED"] },
        },
        select: { id: true, status: true },
      },
      maintenanceWindows: {
        where: {
          tenantId,
          startsAt: { lte: new Date() },
          endsAt: { gte: new Date() },
          OR: [{ deviceId: null }, { device: visibleDevices }],
        },
      },
    },
  });
  if (!g) throw new AccessError(404, "Gateway nicht gefunden.");
  const reasons: string[] = [];
  if (!g.lastSeenAt) reasons.push("Kein Heartbeat");
  else if (Date.now() - g.lastSeenAt.getTime() > 24 * 3600_000)
    reasons.push("Heartbeat veraltet");
  if (g.status === "OFFLINE") reasons.push("Gateway offline");
  if (g.queueWarning || g.queueDropped > 0)
    reasons.push("Queue-/Store-and-forward-Warnung");
  if (!g.credentials.length) reasons.push("Kein aktives Credential");
  if (g.commands.some((c) => c.status === "FAILED"))
    reasons.push("Fehlgeschlagene Commands");
  return {
    gatewayId: id,
    status: g.maintenanceWindows.length
      ? "WARNING"
      : reasons.some((r) => r.includes("Kein") || r.includes("offline"))
        ? "CRITICAL"
        : reasons.length
          ? "WARNING"
          : "HEALTHY",
    reasons,
    connectedDevices: g.devices.length,
  };
}
