import "server-only";
import { db } from "./db";
import { propertyScope, tenantScope, type Actor } from "./policy";

export async function globalSearch(
  actor: Actor,
  query: string,
  requested?: string | null,
) {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  if (actor.role === "SUPER_ADMIN" && !requested) {
    const tenants = await db.tenant.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, slug: true },
      take: 8,
    });
    return tenants.map((item) => ({
      id: item.id,
      kind: "Kunde",
      label: item.name,
      detail: item.slug,
      href: `/portfolio?tenantId=${encodeURIComponent(item.id)}`,
    }));
  }
  const tenantId = tenantScope(actor, requested);
  const property = propertyScope(actor, tenantId);
  const [tenants, properties, buildings, units, meters, devices, gateways] =
    await Promise.all([
      actor.role === "SUPER_ADMIN"
        ? db.tenant.findMany({
            where: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { slug: { contains: q, mode: "insensitive" } },
              ],
            },
            select: { id: true, name: true, slug: true },
            take: 5,
          })
        : Promise.resolve([]),
      db.property.findMany({
        where: {
          ...property,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { address: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, city: true },
        take: 5,
      }),
      db.building.findMany({
        where: {
          tenantId,
          property,
          name: { contains: q, mode: "insensitive" },
        },
        select: { id: true, name: true, property: { select: { name: true } } },
        take: 5,
      }),
      db.unit.findMany({
        where: {
          tenantId,
          building: { property },
          name: { contains: q, mode: "insensitive" },
        },
        select: { id: true, name: true, building: { select: { name: true } } },
        take: 5,
      }),
      db.meter.findMany({
        where: {
          tenantId,
          unit: { building: { property } },
          OR: [
            { serialNumber: { contains: q, mode: "insensitive" } },
            { externalDeviceId: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, serialNumber: true, type: true },
        take: 8,
      }),
      db.device.findMany({
        where: {
          tenantId,
          meter: { unit: { building: { property } } },
          externalDeviceId: { contains: q, mode: "insensitive" },
        },
        select: { id: true, externalDeviceId: true, protocol: true },
        take: 5,
      }),
      db.gateway.findMany({
        where: {
          tenantId,
          externalGatewayId: { contains: q, mode: "insensitive" },
        },
        select: { id: true, name: true, externalGatewayId: true },
        take: 5,
      }),
    ]);
  const suffix =
    actor.role === "SUPER_ADMIN"
      ? `?tenantId=${encodeURIComponent(tenantId)}`
      : "";
  return [
    ...tenants.map((item) => ({
      id: item.id,
      kind: "Kunde",
      label: item.name,
      detail: item.slug,
      href: `/portfolio?tenantId=${encodeURIComponent(item.id)}`,
    })),
    ...properties.map((item) => ({
      id: item.id,
      kind: "Liegenschaft",
      label: item.name,
      detail: item.city,
      href: `/properties${suffix}`,
    })),
    ...buildings.map((item) => ({
      id: item.id,
      kind: "Gebäude",
      label: item.name,
      detail: item.property.name,
      href: `/buildings${suffix}`,
    })),
    ...units.map((item) => ({
      id: item.id,
      kind: "Nutzungseinheit",
      label: item.name,
      detail: item.building.name,
      href: `/units${suffix}`,
    })),
    ...meters.map((item) => ({
      id: item.id,
      kind: "Zähler",
      label: item.serialNumber,
      detail: item.type,
      href: `/meters/${item.id}${suffix ? `${suffix}` : ""}`,
    })),
    ...devices.map((item) => ({
      id: item.id,
      kind: "Device",
      label: item.externalDeviceId,
      detail: item.protocol,
      href: `/devices${suffix}`,
    })),
    ...gateways.map((item) => ({
      id: item.id,
      kind: "Gateway",
      label: item.externalGatewayId,
      detail: item.name,
      href: `/gateways${suffix}`,
    })),
  ];
}
