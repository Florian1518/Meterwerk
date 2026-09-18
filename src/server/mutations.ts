import "server-only";
import { z } from "zod";
import { db } from "./db";
import { AccessError, requireManage, tenantScope, type Actor } from "./policy";
import {
  editableResources,
  writeResource,
  saveSettings,
  revokeGrant,
} from "./crud";
const id = z.string().min(1).max(160);
export async function mutate(
  actor: Actor,
  input: unknown,
  requested?: string | null,
) {
  requireManage(actor);
  const request = z
    .object({
      kind: z.string(),
      operation: z.enum(["create", "update", "delete"]).default("create"),
    })
    .parse(input);
  if (
    editableResources.includes(
      request.kind as (typeof editableResources)[number],
    )
  )
    return writeResource(
      actor,
      request.kind,
      request.operation,
      input,
      requested,
    );
  if (request.kind === "settings") {
    if (request.operation === "delete")
      throw new AccessError(400, "Einstellungen können nicht gelöscht werden.");
    return saveSettings(actor, input, requested);
  }
  if (request.kind === "grant" && request.operation === "delete")
    return revokeGrant(actor, input, requested);
  const tenantId = tenantScope(actor, requested);
  if (request.kind === "grant") {
    const value = z.object({ userId: id, propertyId: id }).parse(input);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
      const [user, property] = await Promise.all([
        tx.user.findFirst({
          where: { id: value.userId, tenantId, role: "USER" },
        }),
        tx.property.findFirst({ where: { id: value.propertyId, tenantId } }),
      ]);
      if (!user || !property)
        throw new AccessError(
          404,
          "Benutzer oder Liegenschaft nicht gefunden.",
        );
      await tx.propertyGrant.upsert({
        where: { userId_propertyId: value },
        create: { ...value, tenantId },
        update: {},
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          tenantId,
          action: "grant.create",
          entityId: property.id,
        },
      });
      return { id: property.id };
    });
  }
  // Backward compatible status-only action; full alarm CRUD uses kind=alarms.
  if (request.kind === "alarm") {
    const value = z
      .object({ id, status: z.enum(["ACKNOWLEDGED", "RESOLVED"]) })
      .parse(input);
    return db.$transaction(async (tx) => {
      const result = await tx.alarm.updateMany({
        where: { id: value.id, tenantId },
        data: { status: value.status },
      });
      if (!result.count) throw new AccessError(404, "Alarm nicht gefunden.");
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          tenantId,
          action: "alarms.update",
          entityId: value.id,
        },
      });
      return { id: value.id };
    });
  }
  throw new AccessError(404, "Schnittstelle nicht gefunden.");
}
