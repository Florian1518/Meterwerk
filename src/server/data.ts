import "server-only";
import { db } from "./db";
import {
  AccessError,
  propertyScope,
  requireManage,
  requirePlatform,
  tenantScope,
  type Actor,
} from "./policy";
export const resources = [
  "properties",
  "buildings",
  "units",
  "meters",
  "users",
  "alarms",
  "readings",
  "devices",
  "gateways",
] as const;
export type Resource = (typeof resources)[number];
export async function listTenants(actor: Actor) {
  requirePlatform(actor);
  return db.tenant.findMany({
    orderBy: { name: "asc" },
    take: 200,
    include: { _count: { select: { properties: true, users: true } } },
  });
}
export async function listResource(
  actor: Actor,
  resource: Resource,
  requested?: string | null,
  id?: string,
) {
  const tenantId = tenantScope(actor, requested);
  const property = propertyScope(actor, tenantId);
  const building = { tenantId, property };
  const unit = { tenantId, building };
  const meter = { tenantId, unit };
  switch (resource) {
    case "properties":
      return db.property.findMany({
        where: { ...property, ...(id ? { id } : {}) },
        include: { _count: { select: { buildings: true } } },
        orderBy: { name: "asc" },
        take: 200,
      });
    case "buildings":
      return db.building.findMany({
        where: { ...building, ...(id ? { id } : {}) },
        include: {
          property: { select: { name: true } },
          _count: { select: { units: true } },
        },
        orderBy: { name: "asc" },
        take: 200,
      });
    case "units":
      return db.unit.findMany({
        where: { ...unit, ...(id ? { id } : {}) },
        include: {
          building: { select: { name: true } },
          _count: { select: { meters: true } },
        },
        orderBy: { name: "asc" },
        take: 200,
      });
    case "meters":
      return db.meter.findMany({
        where: { ...meter, ...(id ? { id } : {}) },
        include: { unit: { select: { name: true } } },
        orderBy: { serialNumber: "asc" },
        take: 200,
      });
    case "alarms":
      return db.alarm.findMany({
        where: { tenantId, meter, ...(id ? { id } : {}) },
        include: { meter: { select: { serialNumber: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
    case "readings":
      return db.reading.findMany({
        where: { tenantId, meter, ...(id ? { id } : {}) },
        orderBy: { timestamp: "desc" },
        take: 200,
      });
    case "users": {
      requireManage(actor);
      return db.user.findMany({
        where: { tenantId, ...(id ? { id } : {}) },
        select: {
          id: true,
          tenantId: true,
          name: true,
          email: true,
          role: true,
          active: true,
          grants: {
            select: { propertyId: true, property: { select: { name: true } } },
          },
        },
        orderBy: { name: "asc" },
        take: 200,
      });
    }
    case "devices":
      return db.device.findMany({
        where: { tenantId, meter, ...(id ? { id } : {}) },
        include: {
          meter: { select: { serialNumber: true, type: true } },
          gateway: { select: { name: true } },
        },
        orderBy: { externalDeviceId: "asc" },
        take: 200,
      });
    case "gateways":
      return db.gateway.findMany({
        where: {
          tenantId,
          ...(actor.role === "USER"
            ? { devices: { some: { tenantId, meter } } }
            : {}),
          ...(id ? { id } : {}),
        },
        include: {
          _count: { select: { devices: { where: { tenantId, meter } } } },
        },
        orderBy: { name: "asc" },
        take: 200,
      });
  }
}
export async function getMeter(
  actor: Actor,
  id: string,
  requested?: string | null,
) {
  const tenantId = tenantScope(actor, requested);
  const meter = await db.meter.findFirst({
    where: {
      id,
      tenantId,
      unit: { building: { property: propertyScope(actor, tenantId) } },
    },
    include: {
      readings: {
        where: { tenantId },
        orderBy: { timestamp: "desc" },
        take: 48,
      },
    },
  });
  if (!meter) throw new AccessError(404, "Zähler nicht gefunden.");
  return meter;
}
