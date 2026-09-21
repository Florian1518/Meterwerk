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
const replacementSchema = z
  .object({
    oldMeterId: z.string().min(1),
    newMeterId: z.string().min(1),
    removedAt: z.iso.datetime({ offset: true }),
    removedRegister: z.string().regex(/^\d+(\.\d{1,6})?$/),
    installedAt: z.iso.datetime({ offset: true }),
    installedRegister: z.string().regex(/^\d+(\.\d{1,6})?$/),
    reason: z.string().trim().min(1).max(240),
    documentation: z.string().max(2000).optional(),
  })
  .strict();
export async function replaceMeter(raw: unknown, requested?: string | null) {
  const actor = await requireActor();
  requireManage(actor);
  const tenantId = tenantScope(actor, requested);
  const value = replacementSchema.parse(raw);
  const removedAt = new Date(value.removedAt),
    installedAt = new Date(value.installedAt);
  if (installedAt < removedAt)
    throw new AccessError(400, "Einbauzeitpunkt liegt vor dem Ausbau.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${tenantId} FOR UPDATE`;
    const [oldMeter, newMeter] = await Promise.all([
      tx.meter.findFirst({
        where: {
          id: value.oldMeterId,
          tenantId,
          unit: { building: { property: propertyScope(actor, tenantId) } },
        },
      }),
      tx.meter.findFirst({
        where: {
          id: value.newMeterId,
          tenantId,
          unit: { building: { property: propertyScope(actor, tenantId) } },
        },
      }),
    ]);
    if (!oldMeter || !newMeter)
      throw new AccessError(404, "Zähler nicht gefunden.");
    if (
      oldMeter.id === newMeter.id ||
      oldMeter.type !== newMeter.type ||
      oldMeter.measurementUnit !== newMeter.measurementUnit
    )
      throw new AccessError(409, "Zähler müssen Medium und Einheit teilen.");
    const row = await tx.meterReplacement.create({
      data: {
        tenantId,
        oldMeterId: oldMeter.id,
        newMeterId: newMeter.id,
        removedAt,
        removedRegister: value.removedRegister,
        installedAt,
        installedRegister: value.installedRegister,
        reason: value.reason,
        documentation: value.documentation,
        actorId: actor.id,
      },
    });
    await tx.meter.update({
      where: { id: oldMeter.id },
      data: { status: "MAINTENANCE" },
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        action: "meter.replacement",
        entityId: row.id,
      },
    });
    return row;
  });
}
export async function listReplacements(
  meterId: string,
  requested?: string | null,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  return db.meterReplacement.findMany({
    where: { tenantId, OR: [{ oldMeterId: meterId }, { newMeterId: meterId }] },
    orderBy: { removedAt: "desc" },
    include: {
      oldMeter: { select: { serialNumber: true } },
      newMeter: { select: { serialNumber: true } },
    },
  });
}
