import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  documentationSchema,
  commissioningSchema,
  fieldRequestSchema,
  netMinutes,
  signatureSchema,
  templateSchema,
  timeSchema,
} from "@/lib/field-documentation";
import { canManageWorkOrders, terminal } from "@/lib/field-service";
import { mutate } from "./field-service";
import { requireActor } from "./auth";
import { AccessError, tenantScope } from "./policy";
import { db } from "./db";
import { replaceMeterInTransaction } from "./meter-replacement";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
type CompletionOrder = {
  type: string;
  documentation: unknown;
  commissioning: unknown;
  replacementId: string | null;
  requireTechnicianSignature: boolean;
  requireCustomerSignature: boolean;
  entries: { kind: string; payload: unknown }[];
};
export function completionError(row: CompletionOrder): string | null {
  const doc = documentationSchema.safeParse(row.documentation);
  if (!doc.success || !doc.data.report || !doc.data.workPerformed)
    return "Arbeitsbericht, ausgeführte Arbeiten und plausible tatsächliche Einsatzzeiten fehlen.";
  if (Date.parse(doc.data.actualEnd) > Date.now() + 60000)
    return "Das tatsächliche Ende liegt in der Zukunft.";
  if (["INSTALLATION", "COMMISSIONING"].includes(row.type)) {
    const protocol = commissioningSchema.safeParse(row.commissioning);
    if (!protocol.success || protocol.data.result === "FAILED")
      return "Erfolgreiches Inbetriebnahmeprotokoll fehlt.";
  }
  if (row.type === "METER_REPLACEMENT" && !row.replacementId)
    return "Verknüpftes Zählerwechselprotokoll fehlt.";
  const times = row.entries.filter((e) => e.kind === "time");
  if (!times.length) return "Mindestens ein Arbeitszeitblock erforderlich.";
  for (const entry of times) {
    const time = timeSchema.safeParse(entry.payload);
    if (
      !time.success ||
      Date.parse(time.data.start) < Date.parse(doc.data.actualStart) ||
      Date.parse(time.data.end) > Date.parse(doc.data.actualEnd)
    )
      return "Arbeitszeiten müssen innerhalb der tatsächlichen Einsatzzeit liegen.";
  }
  for (const [needed, role] of [
    [row.requireTechnicianSignature, "TECHNICIAN"],
    [row.requireCustomerSignature, "CUSTOMER"],
  ] as const) {
    if (
      needed &&
      !row.entries.some(
        (e) =>
          e.kind === "signature" &&
          signatureSchema.safeParse(e.payload).data?.role === role,
      )
    )
      return "Erforderliche Einsatz-/Abnahmebestätigung fehlt.";
  }
  return null;
}

export async function saveFieldDocumentation(
  id: string,
  raw: unknown,
  requested?: string | null,
) {
  const input = fieldRequestSchema.parse(raw);
  return mutate(requested, id, async (tx, row, actor, tenantId) => {
    const digest = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const prior = await tx.workOrderReceipt.findUnique({
      where: {
        workOrderId_tenantId_requestId: {
          workOrderId: id,
          tenantId,
          requestId: input.requestId,
        },
      },
    });
    if (prior) {
      if (prior.digest !== digest || prior.actorId !== actor.id)
        throw new AccessError(
          409,
          "Request-ID wurde bereits anders verwendet.",
        );
      return { revision: prior.revision, replayed: true };
    }
    if (terminal(row.status))
      throw new AccessError(
        409,
        "Abgeschlossene Einsätze sind unveränderlich.",
      );
    if (row.revision !== input.revision)
      throw new AccessError(
        409,
        "Der Einsatz wurde inzwischen geändert. Bitte gespeicherten Stand neu laden und Änderungen abgleichen.",
      );
    const { mutation } = input;
    // Signatures bind the complete record. No silent post-signature editing.
    if (
      row.entries.some((e) => e.kind === "signature") &&
      mutation.kind !== "signature"
    )
      throw new AccessError(
        409,
        "Bereits bestätigte Einsatzdaten dürfen nicht verändert werden.",
      );
    let before: unknown = null;
    const data: Prisma.WorkOrderUncheckedUpdateInput = {
      revision: { increment: 1 },
    };
    if (mutation.kind === "documentation") {
      before = row.documentation;
      data.documentation = json(mutation.value);
    } else if (mutation.kind === "commissioning") {
      if (!["INSTALLATION", "COMMISSIONING"].includes(row.type))
        throw new AccessError(400, "Kein Inbetriebnahmeauftrag.");
      if (
        mutation.value.deviceProfileId &&
        !(await tx.deviceProfile.findFirst({
          where: { id: mutation.value.deviceProfileId, tenantId, active: true },
          select: { id: true },
        }))
      )
        throw new AccessError(404, "Geräteprofil nicht gefunden.");
      before = row.commissioning;
      data.commissioning = json(mutation.value);
    } else if (mutation.kind === "replacement") {
      if (row.type !== "METER_REPLACEMENT")
        throw new AccessError(400, "Kein Zählerwechselauftrag.");
      const v = mutation.value;
      if (
        row.replacementId &&
        (v.replacement || v.replacementId !== row.replacementId)
      )
        throw new AccessError(
          409,
          "Der Einsatz besitzt bereits einen verknüpften Zählerwechsel.",
        );
      if (v.replacement) {
        for (const meterId of [
          v.replacement.oldMeterId,
          v.replacement.newMeterId,
        ]) {
          if (
            !(await tx.meter.findFirst({
              where: {
                id: meterId,
                tenantId,
                ...(row.unitId ? { unitId: row.unitId } : {}),
                unit: { building: { propertyId: row.propertyId, tenantId } },
              },
              select: { id: true },
            }))
          )
            throw new AccessError(
              404,
              "Zähler gehört nicht zum Einsatzbereich.",
            );
        }
        if (row.meterId && row.meterId !== v.replacement.oldMeterId)
          throw new AccessError(
            400,
            "Alter Zähler stimmt nicht mit Auftrag überein.",
          );
        const created = await replaceMeterInTransaction(
          tx,
          actor,
          tenantId,
          v.replacement,
        );
        v.replacementId = created.id;
      }
      const replacement = await tx.meterReplacement.findFirst({
        where: {
          id: v.replacementId,
          tenantId,
          ...(row.meterId ? { oldMeterId: row.meterId } : {}),
          oldMeter: {
            ...(row.unitId ? { unitId: row.unitId } : {}),
            unit: { building: { propertyId: row.propertyId, tenantId } },
          },
          newMeter: {
            ...(row.unitId ? { unitId: row.unitId } : {}),
            unit: { building: { propertyId: row.propertyId, tenantId } },
          },
        },
        include: { oldMeter: true, newMeter: true },
      });
      if (!replacement)
        throw new AccessError(
          404,
          "Zählerwechsel gehört nicht zum Einsatzbereich.",
        );
      if (
        replacement.oldMeter.type !== replacement.newMeter.type ||
        replacement.oldMeter.measurementUnit !==
          replacement.newMeter.measurementUnit ||
        replacement.installedAt < replacement.removedAt
      )
        throw new AccessError(409, "Zählerwechsel ist nicht plausibel.");
      for (const photoId of [v.oldPhotoId, v.newPhotoId]) {
        if (
          !(await tx.attachment.findFirst({
            where: {
              id: photoId,
              tenantId,
              workOrderId: id,
              contentType: { in: ["image/jpeg", "image/png"] },
            },
            select: { id: true },
          }))
        )
          throw new AccessError(
            404,
            "Zählerfoto fehlt oder gehört nicht zum Einsatz.",
          );
      }
      before = row.replacementDetails;
      data.replacementId = replacement.id;
      data.replacementDetails = json({
        ...v,
        technicianId: actor.id,
        technician: actor.name,
        oldSerialNumber: replacement.oldMeter.serialNumber,
        newSerialNumber: replacement.newMeter.serialNumber,
        medium: replacement.oldMeter.type,
        unit: replacement.oldMeter.measurementUnit,
      });
    } else if (mutation.kind === "template") {
      if (!canManageWorkOrders(actor.role))
        throw new AccessError(
          403,
          "Vorlagenübernahme benötigt Einsatzverwaltung.",
        );
      const template = await tx.checklistTemplate.findFirst({
        where: { id: mutation.value.templateId, tenantId, type: row.type },
      });
      if (!template)
        throw new AccessError(404, "Passende Vorlage nicht gefunden.");
      const v = templateSchema.parse(template.definition);
      if (
        row.meterId &&
        !(await tx.meter.findFirst({
          where: {
            id: row.meterId,
            tenantId,
            type: v.medium,
            ...(v.deviceProfileId
              ? {
                  devices: { some: { tenantId, profileId: v.deviceProfileId } },
                }
              : {}),
          },
          select: { id: true },
        }))
      )
        throw new AccessError(
          400,
          "Vorlage passt nicht zum Medium / Geräteprofil.",
        );
      if (v.deviceProfileId && !row.meterId)
        throw new AccessError(
          400,
          "Profilvorlage benötigt einen zugeordneten Zähler.",
        );
      await tx.workOrderChecklist.create({
        data: {
          tenantId,
          workOrderId: id,
          title: `${v.title} (Vorlage v${template.version})`,
          items: { create: v.items.map((item) => ({ ...item, tenantId })) },
        },
      });
      data.requireTechnicianSignature =
        row.requireTechnicianSignature || v.requireTechnicianSignature;
      data.requireCustomerSignature =
        row.requireCustomerSignature || v.requireCustomerSignature;
    } else {
      const { kind, value } = mutation;
      if (kind === "signature") {
        if (row.status !== "IN_PROGRESS")
          throw new AccessError(
            409,
            "Bestätigung nur im laufenden Einsatz möglich.",
          );
        const error = completionError({
          ...row,
          requireTechnicianSignature: false,
          requireCustomerSignature: false,
        });
        if (
          error ||
          row.checklists.some((c) =>
            c.items.some((i) => i.required && !i.completed),
          )
        )
          throw new AccessError(
            409,
            error ?? "Pflichtchecklisten zuerst erledigen.",
          );
        if (
          row.entries.some(
            (e) =>
              e.kind === "signature" &&
              signatureSchema.parse(e.payload).role === value.role,
          )
        )
          throw new AccessError(
            409,
            "Diese Bestätigung ist bereits vorhanden und unveränderlich.",
          );
        if (
          value.role === "TECHNICIAN" &&
          !row.assignments.some((a) => a.userId === actor.id)
        )
          throw new AccessError(
            403,
            "Nur zugewiesene Techniker können selbst bestätigen.",
          );
      }
      if (kind === "time") {
        if (
          value.entryId &&
          !row.entries.some((e) => e.id === value.entryId && e.kind === "time")
        )
          throw new AccessError(404, "Zeitblock nicht gefunden.");
        if (actor.role === "USER" && value.technicianId !== actor.id)
          throw new AccessError(403, "Nur eigene Arbeitszeiten erfassen.");
        if (!row.assignments.some((a) => a.userId === value.technicianId))
          throw new AccessError(400, "Techniker ist nicht zugewiesen.");
        for (const entry of row.entries.filter(
          (e) => e.kind === "time" && e.id !== value.entryId,
        )) {
          const other = timeSchema.parse(entry.payload);
          if (
            other.technicianId === value.technicianId &&
            Date.parse(value.start) < Date.parse(other.end) &&
            Date.parse(value.end) > Date.parse(other.start)
          )
            throw new AccessError(
              409,
              "Arbeitszeitblöcke dürfen sich nicht überschneiden.",
            );
        }
        if (value.entryId) {
          const original = row.entries.find(
            (e) => e.id === value.entryId && e.kind === "time",
          );
          if (!original)
            throw new AccessError(404, "Zeitblock nicht gefunden.");
          if (
            timeSchema.parse(original.payload).technicianId !==
            value.technicianId
          )
            throw new AccessError(
              403,
              "Techniker eines Zeitblocks darf nicht geändert werden.",
            );
          before = original.payload;
          await tx.workOrderEntry.update({
            where: { id_tenantId: { id: original.id, tenantId } },
            data: { payload: json(value) },
          });
        } else
          await tx.workOrderEntry.create({
            data: {
              tenantId,
              workOrderId: id,
              actorId: actor.id,
              kind,
              payload: json(value),
            },
          });
      } else
        await tx.workOrderEntry.create({
          data: {
            tenantId,
            workOrderId: id,
            actorId: actor.id,
            kind,
            payload: json(value),
            quantity: kind === "material" ? value.quantity : null,
          },
        });
    }
    await tx.workOrder.update({
      where: { id_tenantId: { id, tenantId } },
      data,
    });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: id,
        action: `work-order.${mutation.kind}${mutation.kind === "time" && mutation.value.entryId ? "-corrected" : "-saved"}`,
        details: json({
          before,
          after:
            mutation.kind === "signature"
              ? {
                  name: mutation.value.name,
                  role: mutation.value.role,
                  digest: createHash("sha256")
                    .update(JSON.stringify(mutation.value))
                    .digest("hex"),
                }
              : mutation.value,
          revision: row.revision + 1,
          ...(mutation.kind === "time"
            ? { netMinutes: netMinutes(mutation.value) }
            : {}),
        }),
      },
    });
    await tx.workOrderReceipt.create({
      data: {
        tenantId,
        workOrderId: id,
        actorId: actor.id,
        requestId: input.requestId,
        digest,
        revision: row.revision + 1,
      },
    });
    return { revision: row.revision + 1, replayed: false };
  });
}

export async function listChecklistTemplates(requested?: string | null) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  if (!canManageWorkOrders(actor.role))
    throw new AccessError(403, "Keine Vorlagenverwaltung.");
  return db.checklistTemplate.findMany({
    where: { tenantId },
    orderBy: { title: "asc" },
  });
}
export async function saveChecklistTemplate(
  raw: unknown,
  requested?: string | null,
  id?: string,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  if (!canManageWorkOrders(actor.role))
    throw new AccessError(403, "Keine Vorlagenverwaltung.");
  const value = templateSchema.parse(raw);
  return db.$transaction(async (tx) => {
    if (
      value.deviceProfileId &&
      !(await tx.deviceProfile.findFirst({
        where: { id: value.deviceProfileId, tenantId, utility: value.medium },
        select: { id: true },
      }))
    )
      throw new AccessError(404, "Geräteprofil nicht gefunden.");
    const before = id
      ? await tx.checklistTemplate.findFirst({ where: { id, tenantId } })
      : null;
    if (id && !before) throw new AccessError(404, "Vorlage nicht gefunden.");
    const data = {
      title: value.title,
      type: value.type,
      medium: value.medium,
      deviceProfileId: value.deviceProfileId,
      definition: json(value),
    };
    const row = id
      ? await tx.checklistTemplate.update({
          where: { id_tenantId: { id, tenantId } },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.checklistTemplate.create({ data: { ...data, tenantId } });
    await tx.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityId: row.id,
        action: "checklist-template.saved",
        details: json({ before, after: row }),
      },
    });
    return row;
  });
}
