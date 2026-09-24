import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, tenantScope, type Actor } from "./policy";
import { canManageWorkOrders, fieldId } from "@/lib/field-service";
import { workOrderScope } from "./field-service";
import {
  addendumSchema,
  addendumStatusSchema,
  calendarQuerySchema,
} from "@/lib/field-service-planning";

function manage(actor: Actor) {
  if (!canManageWorkOrders(actor.role))
    throw new AccessError(403, "Keine Berechtigung für Disposition.");
}
async function context(requested?: string | null) {
  const actor = await requireActor();
  return { actor, tenantId: tenantScope(actor, requested) };
}
function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  tenantId: string,
  entityId: string,
  action: string,
  details: Prisma.InputJsonObject = {},
) {
  return tx.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      entityId,
      action: `work-order.${action}`,
      details,
    },
  });
}

export async function calendarWorkOrders(
  raw: unknown,
  requested?: string | null,
) {
  const { actor, tenantId } = await context(requested);
  const q = calendarQuerySchema.parse(raw);
  const where: Prisma.WorkOrderWhereInput = {
    ...workOrderScope(actor, tenantId),
    scheduledAt: { gte: new Date(q.from), lt: new Date(q.to) },
    ...(q.technicianId
      ? { assignments: { some: { tenantId, userId: q.technicianId } } }
      : {}),
    ...(q.status ? { status: q.status as never } : {}),
    ...(q.priority ? { priority: q.priority as never } : {}),
    ...(q.propertyId ? { propertyId: q.propertyId } : {}),
  };
  const rows = await db.workOrder.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      number: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      scheduledAt: true,
      property: { select: { id: true, name: true } },
      assignments: { select: { user: { select: { id: true, name: true } } } },
    },
  });
  const byTechnician = new Map<string, typeof rows>();
  for (const row of rows)
    for (const a of row.assignments)
      byTechnician.set(a.user.id, [
        ...(byTechnician.get(a.user.id) ?? []),
        row,
      ]);
  const conflicts = [...byTechnician].flatMap(([technicianId, assignments]) =>
    assignments.flatMap((a, i) =>
      assignments
        .slice(i + 1)
        .filter(
          (b) =>
            a.scheduledAt &&
            b.scheduledAt &&
            Math.abs(a.scheduledAt.getTime() - b.scheduledAt.getTime()) <
              60 * 60 * 1000,
        )
        .map((b) => ({ technicianId, workOrderIds: [a.id, b.id] })),
    ),
  );
  return {
    rows,
    conflicts: conflicts.filter(
      (v, i, all) =>
        all.findIndex(
          (x) =>
            x.technicianId === v.technicianId &&
            x.workOrderIds.join() === v.workOrderIds.join(),
        ) === i,
    ),
  };
}

export async function rescheduleWorkOrder(
  id: string,
  scheduledAt: string,
  requested?: string | null,
) {
  const { actor, tenantId } = await context(requested);
  manage(actor);
  fieldId.parse(id);
  const date = new Date(zDate(scheduledAt));
  return db.$transaction(async (tx) => {
    const row = await tx.workOrder.findFirst({
      where: { ...workOrderScope(actor, tenantId), id },
      include: { assignments: { select: { userId: true } } },
    });
    if (!row) throw new AccessError(404, "Einsatz nicht gefunden.");
    const updated = await tx.workOrder.update({
      where: { id_tenantId: { id, tenantId } },
      data: { scheduledAt: date },
    });
    await audit(tx, actor, tenantId, id, "rescheduled", {
      before: row.scheduledAt?.toISOString() ?? null,
      after: date.toISOString(),
    });
    return updated;
  });
}
function zDate(value: string) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime()))
    throw new AccessError(400, "Ungültiger Termin.");
  return value;
}

export async function createAddendum(
  workOrderId: string,
  raw: unknown,
  requested?: string | null,
) {
  const { actor, tenantId } = await context(requested);
  const value = addendumSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const order = await tx.workOrder.findFirst({
      where: { ...workOrderScope(actor, tenantId), id: workOrderId },
      select: { id: true },
    });
    if (!order) throw new AccessError(404, "Einsatz nicht gefunden.");
    const row = await tx.workOrderAddendum.create({
      data: { ...value, tenantId, workOrderId, createdById: actor.id },
    });
    await audit(tx, actor, tenantId, workOrderId, "addendum-created", {
      addendumId: row.id,
    });
    return row;
  });
}
export async function listAddenda(
  workOrderId: string,
  requested?: string | null,
) {
  const { actor, tenantId } = await context(requested);
  const order = await db.workOrder.findFirst({
    where: { ...workOrderScope(actor, tenantId), id: workOrderId },
    select: { id: true },
  });
  if (!order) throw new AccessError(404, "Einsatz nicht gefunden.");
  return db.workOrderAddendum.findMany({
    where: { tenantId, workOrderId },
    orderBy: { createdAt: "asc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
}
export async function changeAddendumStatus(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  const { actor, tenantId } = await context(requested);
  manage(actor);
  const { status } = addendumStatusSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const row = await tx.workOrderAddendum.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new AccessError(404, "Nachtrag nicht gefunden.");
    const updated = await tx.workOrderAddendum.update({
      where: { id_tenantId: { id, tenantId } },
      data: { status },
    });
    await audit(tx, actor, tenantId, row.workOrderId, "addendum-status", {
      addendumId: id,
      before: row.status,
      after: status,
    });
    return updated;
  });
}
