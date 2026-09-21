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
import { utilities } from "../lib/utility";
import type { Prisma } from "@/generated/prisma/client";
const profileSchema = z
  .object({
    id: z.string().min(1).max(160).optional(),
    manufacturer: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(120),
    utility: z.enum(utilities),
    protocol: z.enum([
      "MODBUS_RTU",
      "MODBUS_TCP",
      "MBUS",
      "WMBUS",
      "PULSE",
      "LORAWAN",
      "REST",
      "MQTT",
      "VENDOR_API",
    ]),
    version: z.number().int().positive(),
    capabilities: z.array(z.string().min(1)).max(64),
    mapping: z.record(z.string(), z.string()),
    defaults: z.record(z.string(), z.unknown()).default({}),
    firmwareNotes: z.string().max(1000).optional(),
  })
  .strict();
export async function listDeviceProfiles(requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  return db.deviceProfile.findMany({
    where: { tenantId, active: true },
    orderBy: [{ manufacturer: "asc" }, { model: "asc" }, { version: "desc" }],
  });
}
export async function createDeviceProfile(
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const value = profileSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const existing = await tx.deviceProfile.findFirst({
      where: {
        tenantId,
        manufacturer: value.manufacturer,
        model: value.model,
        version: value.version,
      },
    });
    if (existing)
      throw new AccessError(409, "Profilversion existiert bereits.");
    const row = await tx.deviceProfile.create({
      data: {
        ...value,
        tenantId,
        protocol: value.protocol,
        capabilities: value.capabilities,
        mapping: value.mapping,
        defaults: value.defaults as Prisma.InputJsonValue,
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "device-profile.create",
        entityId: row.id,
      },
    });
    return row;
  });
}
export async function deviceCapability(
  deviceId: string,
  requested?: string | null,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const device = await db.device.findFirst({
    where: {
      id: deviceId,
      tenantId,
      meter: {
        unit: { building: { property: propertyScope(actor, tenantId) } },
      },
    },
    include: {
      meter: { select: { type: true, serialNumber: true } },
      profile: true,
      pulseConfig: true,
      wirelessConfig: {
        select: {
          deviceIdValue: true,
          manufacturerCode: true,
          securityMode: true,
          rssi: true,
          snr: true,
          receivedAt: true,
        },
      },
    },
  });
  if (!device) throw new AccessError(404, "Gerät nicht gefunden.");
  return {
    deviceId: device.id,
    utility: device.meter.type,
    protocol: device.protocol,
    manufacturer: device.manufacturer,
    model: device.model,
    serialNumber: device.meter.serialNumber,
    profile: device.profile
      ? {
          id: device.profile.id,
          version: device.profile.version,
          capabilities: device.profile.capabilities,
          firmwareNotes: device.profile.firmwareNotes,
        }
      : null,
    protocolConfig: device.protocolConfig,
    protocolMode: device.protocolMode,
    signal: device.wirelessConfig,
    lastContact: device.lastSeenAt?.toISOString() ?? null,
    status: device.status,
  };
}
export async function meterCapability(
  meterId: string,
  requested?: string | null,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const device = await db.device.findFirst({
    where: {
      meterId,
      tenantId,
      meter: {
        unit: { building: { property: propertyScope(actor, tenantId) } },
      },
    },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true },
  });
  return device ? deviceCapability(device.id, tenantId) : null;
}
