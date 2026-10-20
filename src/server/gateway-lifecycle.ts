import "server-only";
import { z } from "zod";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, requirePlatform, tenantScope } from "./policy";
import { lockGatewayTenant } from "./gateway-assignment";

export const gatewayLifecycles = [
  "NEW",
  "PROVISIONING",
  "ACTIVE",
  "MAINTENANCE",
  "FAILED",
  "DECOMMISSIONED",
] as const;
const transitions: Record<
  (typeof gatewayLifecycles)[number],
  readonly string[]
> = {
  NEW: ["PROVISIONING", "DECOMMISSIONED"],
  PROVISIONING: ["ACTIVE", "FAILED", "DECOMMISSIONED"],
  ACTIVE: ["MAINTENANCE", "DECOMMISSIONED"],
  MAINTENANCE: ["ACTIVE", "PROVISIONING", "FAILED", "DECOMMISSIONED"],
  FAILED: ["PROVISIONING", "DECOMMISSIONED"],
  DECOMMISSIONED: [],
};
export function isAllowedGatewayTransition(from: string, to: string) {
  return (transitions[from as keyof typeof transitions] ?? []).includes(to);
}
// Fail closed until 1C-B implements installation/configuration/communication evidence.
function requireGatewayReadiness(): never {
  throw new AccessError(
    409,
    "Gateway-Aktivierung ist bis zur vollständigen Abschlussprüfung gesperrt.",
  );
}
const input = z
  .object({
    status: z.enum(gatewayLifecycles),
    revision: z.number().int().nonnegative(),
    errorCode: z
      .enum([
        "INSTALLATION_FAILED",
        "CONFIGURATION_FAILED",
        "COMMUNICATION_FAILED",
        "OPERATOR_ABORTED",
      ])
      .optional(),
  })
  .strict();

export async function changeGatewayLifecycle(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requirePlatform(actor);
  const tenantId = tenantScope(actor, requested);
  const value = input.parse(raw);
  return db.$transaction(async (tx) => {
    await lockGatewayTenant(tx, tenantId);
    await tx.$queryRaw`SELECT "id" FROM "Gateway" WHERE "id"=${id} AND "tenantId"=${tenantId} FOR UPDATE`;
    const row = await tx.gateway.findFirst({ where: { id, tenantId } });
    if (!row) throw new AccessError(404, "Gateway nicht gefunden.");
    if (row.lifecycleStatus === value.status)
      return {
        id,
        lifecycleStatus: row.lifecycleStatus,
        revision: row.revision,
      };
    if (row.revision !== value.revision)
      throw new AccessError(409, "Gateway wurde zwischenzeitlich geändert.");
    if (!isAllowedGatewayTransition(row.lifecycleStatus, value.status))
      throw new AccessError(409, "Gateway-Statuswechsel nicht erlaubt.");
    if (value.status === "ACTIVE") requireGatewayReadiness();
    if (value.status === "PROVISIONING" && !row.propertyId)
      throw new AccessError(409, "Zuerst eine Liegenschaft zuordnen.");
    if (value.status === "FAILED" && !value.errorCode)
      throw new AccessError(400, "Fehlercode erforderlich.");
    if (value.status !== "FAILED" && value.errorCode)
      throw new AccessError(
        400,
        "Fehlercode nur bei fehlgeschlagener Inbetriebnahme.",
      );
    const now = new Date();
    if (value.status === "DECOMMISSIONED") {
      await tx.gatewayCredential.updateMany({
        where: { tenantId, gatewayId: id, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: now },
      });
      await tx.gatewayCommand.updateMany({
        where: {
          tenantId,
          gatewayId: id,
          status: { in: ["PENDING", "QUEUED", "SENT", "ACKNOWLEDGED"] },
        },
        data: { status: "CANCELLED", completedAt: now },
      });
      await tx.modbusConfiguration.updateMany({
        where: { tenantId, device: { gatewayId: id, tenantId } },
        data: { pollingEnabled: false },
      });
      await tx.gatewayCommunicationIdentity.updateMany({
        where: {
          tenantId,
          gatewayId: id,
          revocationRequestedAt: null,
          revocationConfirmedAt: null,
        },
        data: { revocationRequestedAt: now },
      });
    }
    const updated = await tx.gateway.update({
      where: { id, tenantId, revision: value.revision },
      data: {
        lifecycleStatus: value.status,
        revision: { increment: 1 },
        ...(value.status === "PROVISIONING"
          ? {
              provisioningStartedAt: now,
              commissionedAt: null,
              provisioningFailedAt: null,
              provisioningErrorCode: null,
            }
          : {}),
        ...(value.status === "FAILED"
          ? {
              provisioningFailedAt: now,
              provisioningErrorCode: value.errorCode,
            }
          : {}),
        ...(value.status === "DECOMMISSIONED" ? { decommissionedAt: now } : {}),
      },
      select: { id: true, lifecycleStatus: true, revision: true },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: id,
        action: "gateway.lifecycle.change",
        details: {
          from: row.lifecycleStatus,
          to: value.status,
          revision: updated.revision,
          ...(value.errorCode ? { errorCode: value.errorCode } : {}),
          ...(value.status === "DECOMMISSIONED"
            ? { brokerRevocation: "EXTERNAL_ACTION_REQUIRED" }
            : {}),
        },
      },
    });
    return updated;
  });
}

export async function assignGatewayProperty(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  const actor = await requireActor();
  requirePlatform(actor);
  const tenantId = tenantScope(actor, requested);
  const value = z
    .object({
      propertyId: z.string().min(1),
      revision: z.number().int().nonnegative(),
    })
    .strict()
    .parse(raw);
  return db.$transaction(async (tx) => {
    await lockGatewayTenant(tx, tenantId);
    await tx.$queryRaw`SELECT "id" FROM "Gateway" WHERE "id"=${id} AND "tenantId"=${tenantId} FOR UPDATE`;
    const gateway = await tx.gateway.findFirst({ where: { id, tenantId } });
    const property = await tx.property.findFirst({
      where: { id: value.propertyId, tenantId },
      select: { id: true },
    });
    if (!gateway || !property)
      throw new AccessError(404, "Gateway oder Liegenschaft nicht gefunden.");
    if (gateway.lifecycleStatus === "DECOMMISSIONED")
      throw new AccessError(409, "Gateway ist stillgelegt.");
    if (gateway.propertyId === value.propertyId)
      return { id, propertyId: gateway.propertyId, revision: gateway.revision };
    if (gateway.revision !== value.revision)
      throw new AccessError(409, "Gateway wurde zwischenzeitlich geändert.");
    if (!["NEW", "MAINTENANCE"].includes(gateway.lifecycleStatus))
      throw new AccessError(
        409,
        "Liegenschaft nur vor Inbetriebnahme oder in Wartung ändern.",
      );
    const devices = await tx.device.findMany({
      where: { tenantId, gatewayId: id },
      select: {
        meter: {
          select: {
            unit: { select: { building: { select: { propertyId: true } } } },
          },
        },
      },
    });
    if (
      (gateway.propertyId && devices.length) ||
      devices.some((d) => d.meter.unit.building.propertyId !== property.id)
    )
      throw new AccessError(
        409,
        "Vorhandene Geräte verhindern diese Liegenschaftszuordnung.",
      );
    if (
      await tx.gatewayCommand.count({
        where: {
          tenantId,
          gatewayId: id,
          status: { in: ["PENDING", "QUEUED", "SENT", "ACKNOWLEDGED"] },
        },
      })
    )
      throw new AccessError(
        409,
        "Offene Gateway-Aktionen verhindern die Zuordnung.",
      );
    const updated = await tx.gateway.update({
      where: { id, tenantId, revision: value.revision },
      data: {
        propertyId: property.id,
        revision: { increment: 1 },
        commissionedAt: null,
      },
      select: { id: true, propertyId: true, revision: true },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: id,
        action: "gateway.property.assign",
        details: {
          from: gateway.propertyId,
          to: property.id,
          revision: updated.revision,
        },
      },
    });
    return updated;
  });
}
