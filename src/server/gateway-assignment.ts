import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { AccessError } from "./policy";

// Internal transaction helpers, not authenticated entry points. Callers authorize
// first. All assignment/hierarchy writers lock Tenant -> Gateway -> Device.
export async function lockGatewayTenant(
  tx: Prisma.TransactionClient,
  tenantId: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${tenantId} FOR UPDATE`;
}

export async function assertGatewayAssignment(
  tx: Prisma.TransactionClient,
  tenantId: string,
  gatewayId: string,
  meterId: string,
  existingDeviceId?: string,
) {
  await lockGatewayTenant(tx, tenantId);
  await tx.$queryRaw`SELECT "id" FROM "Gateway" WHERE "id"=${gatewayId} AND "tenantId"=${tenantId} FOR UPDATE`;
  const gateway = await tx.gateway.findFirst({
    where: { id: gatewayId, tenantId },
  });
  const meter = await tx.meter.findFirst({
    where: { id: meterId, tenantId },
    select: {
      unit: { select: { building: { select: { propertyId: true } } } },
    },
  });
  if (!gateway || !meter)
    throw new AccessError(404, "Gateway oder Zähler nicht gefunden.");
  if (gateway.lifecycleStatus === "DECOMMISSIONED")
    throw new AccessError(409, "Gateway ist stillgelegt.");
  if (!gateway.propertyId) {
    // Only the identical persisted edge may survive the legacy transition.
    const unchanged =
      existingDeviceId &&
      (await tx.device.findFirst({
        where: { id: existingDeviceId, tenantId, gatewayId, meterId },
        select: { id: true },
      }));
    if (!unchanged)
      throw new AccessError(409, "Gateway zuerst einer Liegenschaft zuordnen.");
  } else if (gateway.propertyId !== meter.unit.building.propertyId) {
    throw new AccessError(
      409,
      "Gateway und Zähler müssen derselben Liegenschaft angehören.",
    );
  }
}

// Conservative transition policy: hierarchy moves with gateway descendants need
// a dedicated relocation workflow. Never silently move meters or their history.
export async function assertNoGatewayHierarchyMove(
  tx: Prisma.TransactionClient,
  tenantId: string,
  meterWhere: Prisma.MeterWhereInput,
) {
  await lockGatewayTenant(tx, tenantId);
  if (
    await tx.device.findFirst({
      where: { tenantId, gatewayId: { not: null }, meter: meterWhere },
      select: { id: true },
    })
  )
    throw new AccessError(
      409,
      "Hierarchie mit Gateway-Geräten kann nicht umgehängt werden.",
    );
}
