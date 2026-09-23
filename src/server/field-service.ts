import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, propertyScope, tenantScope, type Actor } from "./policy";
import {
  assignmentSchema,
  canManageWorkOrders,
  checklistItemSchema,
  checklistSchema,
  commentSchema,
  fieldId,
  listSchema,
  statusSchema,
  terminal,
  todayRange,
  transitionError,
  workOrderPatchSchema,
  workOrderSchema,
} from "@/lib/field-service";

const person = { id: true, name: true } as const;
const include = {
  property: { select: { id: true, name: true, address: true, city: true } },
  building: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true } },
  meter: { select: { id: true, serialNumber: true } },
  gateway: { select: { id: true, name: true } },
  internalContact: { select: person },
  assignments: {
    include: { user: { select: person } },
    orderBy: { createdAt: "asc" },
  },
  checklists: {
    include: {
      items: {
        include: { completedBy: { select: person } },
        orderBy: [{ order: "asc" }, { id: "asc" }],
      },
    },
    orderBy: { createdAt: "asc" },
  },
  comments: {
    include: { author: { select: person } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.WorkOrderInclude;

async function context(requested?: string | null) {
  const actor = await requireActor();
  return { actor, tenantId: tenantScope(actor, requested) };
}
function manage(actor: Actor) {
  if (!canManageWorkOrders(actor.role))
    throw new AccessError(403, "Keine Einsatzverwaltungsberechtigung.");
}
function writable(actor: Actor) {
  if (actor.role === "SUPER_ADMIN")
    throw new AccessError(403, "Plattformdiagnose ist nur lesend.");
}
export function workOrderScope(
  actor: Actor,
  tenantId: string,
): Prisma.WorkOrderWhereInput {
  return {
    tenantId,
    deletedAt: null,
    property: propertyScope(actor, tenantId),
    ...(actor.role === "USER"
      ? { assignments: { some: { tenantId, userId: actor.id } } }
      : {}),
  };
}
async function scopedOrder(
  tx: Prisma.TransactionClient,
  actor: Actor,
  tenantId: string,
  id: string,
) {
  const row = await tx.workOrder.findFirst({
    where: { ...workOrderScope(actor, tenantId), id: fieldId.parse(id) },
    include,
  });
  if (!row)
    throw new AccessError(
      404,
      "Einsatz nicht gefunden oder nicht freigegeben.",
    );
  return row;
}
async function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  tenantId: string,
  entityId: string,
  action: string,
  details: Prisma.InputJsonObject = {},
) {
  await tx.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      entityId,
      action: `work-order.${action}`,
      details: { ...details, actorName: actor.name },
    },
  });
}
function snapshot(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
async function mutate<T>(
  requested: string | null | undefined,
  id: string,
  fn: (
    tx: Prisma.TransactionClient,
    row: Awaited<ReturnType<typeof scopedOrder>>,
    actor: Actor,
    tenantId: string,
  ) => Promise<T>,
) {
  const { actor, tenantId } = await context(requested);
  writable(actor);
  fieldId.parse(id);
  return db.$transaction(async (tx) => {
    // All child writes and transitions take this same lock, including completion.
    await tx.$queryRaw`SELECT "id" FROM "WorkOrder" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
    const row = await scopedOrder(tx, actor, tenantId, id);
    return fn(tx, row, actor, tenantId);
  });
}
function open(status: Parameters<typeof terminal>[0]) {
  if (terminal(status))
    throw new AccessError(
      409,
      "Abgeschlossene oder abgebrochene Einsätze sind unveränderlich.",
    );
}
async function verifyReferences(
  tx: Prisma.TransactionClient,
  actor: Actor,
  tenantId: string,
  value: {
    propertyId: string;
    buildingId?: string | null;
    unitId?: string | null;
    meterId?: string | null;
    gatewayId?: string | null;
    internalContactId?: string | null;
  },
) {
  if (
    !(await tx.property.findFirst({
      where: { ...propertyScope(actor, tenantId), id: value.propertyId },
      select: { id: true },
    }))
  )
    throw new AccessError(404, "Liegenschaft nicht freigegeben.");
  if (
    value.buildingId &&
    !(await tx.building.findFirst({
      where: { id: value.buildingId, tenantId, propertyId: value.propertyId },
      select: { id: true },
    }))
  )
    throw new AccessError(400, "Gebäude gehört nicht zur Liegenschaft.");
  if (
    value.unitId &&
    !(await tx.unit.findFirst({
      where: {
        id: value.unitId,
        tenantId,
        ...(value.buildingId ? { buildingId: value.buildingId } : {}),
        building: { propertyId: value.propertyId, tenantId },
      },
      select: { id: true },
    }))
  )
    throw new AccessError(
      400,
      "Nutzungseinheit gehört nicht zum gewählten Bereich.",
    );
  if (
    value.meterId &&
    !(await tx.meter.findFirst({
      where: {
        id: value.meterId,
        tenantId,
        ...(value.unitId ? { unitId: value.unitId } : {}),
        unit: {
          tenantId,
          ...(value.buildingId ? { buildingId: value.buildingId } : {}),
          building: { tenantId, propertyId: value.propertyId },
        },
      },
      select: { id: true },
    }))
  )
    throw new AccessError(400, "Zähler gehört nicht zum gewählten Bereich.");
  if (
    value.gatewayId &&
    !(await tx.gateway.findFirst({
      where: { id: value.gatewayId, tenantId },
      select: { id: true },
    }))
  )
    throw new AccessError(400, "Gateway nicht gefunden.");
  if (
    value.internalContactId &&
    !(await tx.user.findFirst({
      where: { id: value.internalContactId, tenantId, active: true },
      select: person,
    }))
  )
    throw new AccessError(400, "Ansprechpartner nicht gefunden.");
}

export async function listWorkOrders(
  requested?: string | null,
  raw: unknown = {},
) {
  const { actor, tenantId } = await context(requested);
  const { view } = listSchema.parse(raw);
  const where: Prisma.WorkOrderWhereInput = {
    ...workOrderScope(actor, tenantId),
  };
  if (view !== "all")
    where.assignments = { some: { tenantId, userId: actor.id } };
  if (view === "today") where.scheduledAt = todayRange();
  if (view === "planned") where.status = { in: ["PLANNED", "ASSIGNED"] };
  if (view === "active") where.status = { in: ["IN_PROGRESS", "PAUSED"] };
  if (view === "completed") where.status = "COMPLETED";
  return db.workOrder.findMany({
    where,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      number: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      scheduledAt: true,
      property: { select: { name: true } },
    },
  });
}
export async function getWorkOrder(id: string, requested?: string | null) {
  const { actor, tenantId } = await context(requested);
  const row = await scopedOrder(db, actor, tenantId, id);
  const history = await db.auditEvent.findMany({
    where: {
      tenantId,
      entityId: row.id,
      action: { startsWith: "work-order." },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, action: true, details: true, createdAt: true },
  });
  return { ...row, history };
}
export async function fieldServiceOptions(requested?: string | null) {
  const { actor, tenantId } = await context(requested);
  manage(actor);
  const [properties, gateways, users] = await Promise.all([
    db.property.findMany({
      where: propertyScope(actor, tenantId),
      select: {
        id: true,
        name: true,
        buildings: {
          select: {
            id: true,
            name: true,
            units: {
              select: {
                id: true,
                name: true,
                meters: { select: { id: true, serialNumber: true } },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.gateway.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      where: { tenantId, active: true },
      select: {
        ...person,
        role: true,
        grants: { where: { tenantId }, select: { propertyId: true } },
      },
    }),
  ]);
  return { properties, gateways, users };
}
export async function createWorkOrder(raw: unknown, requested?: string | null) {
  const { actor, tenantId } = await context(requested);
  manage(actor);
  const value = workOrderSchema.parse(raw);
  return db.$transaction(async (tx) => {
    await verifyReferences(tx, actor, tenantId, value);
    const row = await tx.workOrder.create({
      data: {
        ...value,
        tenantId,
        number: `EA-${randomUUID()}`,
        scheduledAt: value.scheduledAt ? new Date(value.scheduledAt) : null,
      },
    });
    await audit(tx, actor, tenantId, row.id, "created", {
      after: snapshot(row),
    });
    return row;
  });
}
export async function updateWorkOrder(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  return mutate(requested, id, async (tx, row, actor, tenantId) => {
    manage(actor);
    open(row.status);
    const value = workOrderPatchSchema.parse(raw);
    await verifyReferences(tx, actor, tenantId, { ...row, ...value });
    if (
      value.propertyId &&
      value.propertyId !== row.propertyId &&
      row.assignments.length
    )
      throw new AccessError(
        409,
        "Vor einem Liegenschaftswechsel alle Zuweisungen entfernen.",
      );
    if (value.scheduledAt === null && row.status !== "DRAFT")
      throw new AccessError(
        409,
        "Ein geplanter Einsatz benötigt einen Termin.",
      );
    const updated = await tx.workOrder.update({
      where: { id_tenantId: { id, tenantId } },
      data: {
        ...value,
        scheduledAt:
          value.scheduledAt === undefined
            ? undefined
            : value.scheduledAt
              ? new Date(value.scheduledAt)
              : null,
      },
    });
    const before = Object.fromEntries(
      Object.keys(value).map((key) => [key, row[key as keyof typeof row]]),
    );
    await audit(tx, actor, tenantId, id, "updated", {
      before: snapshot(before),
      after: snapshot(value),
    });
    if (
      value.scheduledAt !== undefined &&
      updated.scheduledAt?.toISOString() !== row.scheduledAt?.toISOString()
    )
      await audit(tx, actor, tenantId, id, "scheduled", {
        before: row.scheduledAt?.toISOString() ?? null,
        after: updated.scheduledAt?.toISOString() ?? null,
      });
    return updated;
  });
}
export async function deleteWorkOrder(id: string, requested?: string | null) {
  return mutate(requested, id, async (tx, row, actor, tenantId) => {
    manage(actor);
    if (row.status !== "DRAFT")
      throw new AccessError(
        409,
        "Nur Entwürfe können gelöscht werden. Geplante Einsätze bitte abbrechen.",
      );
    await tx.workOrder.update({
      where: { id_tenantId: { id, tenantId } },
      data: { deletedAt: new Date() },
    });
    await audit(tx, actor, tenantId, id, "deleted", { number: row.number });
    return { deleted: true };
  });
}
export async function assignTechnician(
  id: string,
  raw: unknown,
  remove: boolean,
  requested?: string | null,
) {
  return mutate(requested, id, async (tx, row, actor, tenantId) => {
    manage(actor);
    open(row.status);
    const { userId } = assignmentSchema.parse(raw);
    let technicianName =
      row.assignments.find((assignment) => assignment.userId === userId)?.user
        .name ?? userId;
    if (remove) {
      if (
        !["DRAFT", "PLANNED"].includes(row.status) &&
        row.assignments.length <= 1
      )
        throw new AccessError(
          409,
          "Letzte Zuweisung benötigt zuerst den Status Geplant.",
        );
      const result = await tx.technicianAssignment.deleteMany({
        where: { workOrderId: id, tenantId, userId },
      });
      if (!result.count)
        throw new AccessError(404, "Zuweisung nicht gefunden.");
    } else {
      const technician = await tx.user.findFirst({
        where: {
          id: userId,
          tenantId,
          role: "USER",
          active: true,
          grants: { some: { tenantId, propertyId: row.propertyId } },
        },
        select: person,
      });
      if (!technician)
        throw new AccessError(
          400,
          "Techniker benötigt eine aktive USER-Mitgliedschaft und Liegenschaftsfreigabe.",
        );
      technicianName = technician.name;
      await tx.technicianAssignment.create({
        data: { tenantId, workOrderId: id, userId },
      });
    }
    await audit(
      tx,
      actor,
      tenantId,
      id,
      remove ? "technician-removed" : "technician-assigned",
      { userId, technicianName },
    );
    return { assigned: !remove };
  });
}
export async function changeWorkOrderStatus(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  return mutate(requested, id, async (tx, row, actor, tenantId) => {
    const { status } = statusSchema.parse(raw);
    if (
      !canManageWorkOrders(actor.role) &&
      !["IN_PROGRESS", "PAUSED", "COMPLETED"].includes(status)
    )
      throw new AccessError(
        403,
        "Techniker dürfen Einsätze starten, pausieren, fortsetzen und abschließen.",
      );
    const assigned = await tx.technicianAssignment.count({
      where: {
        tenantId,
        workOrderId: id,
        user: {
          active: true,
          role: "USER",
          tenantId,
          grants: { some: { tenantId, propertyId: row.propertyId } },
        },
      },
    });
    const error = transitionError(row.status, status, {
      scheduled: !!row.scheduledAt,
      assigned: assigned > 0,
      openRequired: row.checklists.some((list) =>
        list.items.some((item) => item.required && !item.completed),
      ),
    });
    if (error) throw new AccessError(409, error);
    const updated = await tx.workOrder.update({
      where: { id_tenantId: { id, tenantId } },
      data: {
        status,
        ...(status === "IN_PROGRESS" && !row.startedAt
          ? { startedAt: new Date() }
          : {}),
        ...(terminal(status) ? { endedAt: new Date() } : {}),
      },
    });
    await audit(tx, actor, tenantId, id, "status-changed", {
      before: row.status,
      after: status,
    });
    if (terminal(status))
      await audit(
        tx,
        actor,
        tenantId,
        id,
        status === "COMPLETED" ? "completed" : "canceled",
        { before: row.status, after: status },
      );
    return updated;
  });
}
export async function addChecklist(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  return mutate(requested, id, async (tx, row, actor, tenantId) => {
    manage(actor);
    open(row.status);
    const value = checklistSchema.parse(raw);
    const checklist = await tx.workOrderChecklist.create({
      data: {
        tenantId,
        workOrderId: id,
        title: value.title,
        items: { create: value.items.map((item) => ({ ...item, tenantId })) },
      },
    });
    await audit(tx, actor, tenantId, id, "checklist-created", {
      checklistId: checklist.id,
      ...snapshot(value),
    });
    return checklist;
  });
}
export async function completeChecklistItem(
  id: string,
  itemId: string,
  raw: unknown,
  requested?: string | null,
) {
  return mutate(requested, id, async (tx, row, actor, tenantId) => {
    open(row.status);
    if (row.status !== "IN_PROGRESS")
      throw new AccessError(
        409,
        "Checklisten können während der Bearbeitung ausgefüllt werden.",
      );
    const value = checklistItemSchema.parse(raw);
    const item = row.checklists
      .flatMap((list) => list.items)
      .find((item) => item.id === fieldId.parse(itemId));
    if (!item) throw new AccessError(404, "Checklistenpunkt nicht gefunden.");
    const updated = await tx.checklistItem.update({
      where: { id_tenantId: { id: itemId, tenantId } },
      data: {
        ...value,
        completedById: value.completed ? actor.id : null,
        completedAt: value.completed ? new Date() : null,
      },
    });
    await audit(tx, actor, tenantId, id, "checklist-item-updated", {
      itemId,
      title: item.title,
      before: snapshot({
        completed: item.completed,
        comment: item.comment,
        completedById: item.completedById,
        completedByName: item.completedBy?.name ?? null,
        completedAt: item.completedAt,
      }),
      after: snapshot({
        ...value,
        completedById: updated.completedById,
        completedByName: value.completed ? actor.name : null,
        completedAt: updated.completedAt,
      }),
    });
    return updated;
  });
}
export async function addWorkOrderComment(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  return mutate(requested, id, async (tx, row, actor, tenantId) => {
    open(row.status);
    const { body } = commentSchema.parse(raw);
    const comment = await tx.workOrderComment.create({
      data: { tenantId, workOrderId: id, authorId: actor.id, body },
    });
    await audit(tx, actor, tenantId, id, "comment-added", {
      commentId: comment.id,
    });
    return comment;
  });
}
