import { z } from "zod";

export const workOrderTypes = [
  "INSTALLATION",
  "COMMISSIONING",
  "MAINTENANCE",
  "METER_REPLACEMENT",
  "FAULT",
  "INSPECTION",
  "OTHER",
] as const;
export const workOrderStatuses = [
  "DRAFT",
  "PLANNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELED",
] as const;
export const workOrderPriorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type WorkStatus = (typeof workOrderStatuses)[number];
export const typeLabels: Record<(typeof workOrderTypes)[number], string> = {
  INSTALLATION: "Installation",
  COMMISSIONING: "Inbetriebnahme",
  MAINTENANCE: "Wartung",
  METER_REPLACEMENT: "Zählerwechsel",
  FAULT: "Störung",
  INSPECTION: "Inspektion",
  OTHER: "Sonstiges",
};
export const statusLabels: Record<WorkStatus, string> = {
  DRAFT: "Entwurf",
  PLANNED: "Geplant",
  ASSIGNED: "Zugewiesen",
  IN_PROGRESS: "In Bearbeitung",
  PAUSED: "Pausiert",
  COMPLETED: "Abgeschlossen",
  CANCELED: "Abgebrochen",
};
export const priorityLabels = {
  LOW: "Niedrig",
  NORMAL: "Normal",
  HIGH: "Hoch",
  URGENT: "Dringend",
};
export const transitions: Record<WorkStatus, readonly WorkStatus[]> = {
  DRAFT: ["PLANNED", "CANCELED"],
  PLANNED: ["ASSIGNED", "CANCELED"],
  ASSIGNED: ["PLANNED", "IN_PROGRESS", "CANCELED"],
  IN_PROGRESS: ["PAUSED", "COMPLETED", "CANCELED"],
  PAUSED: ["IN_PROGRESS", "CANCELED"],
  COMPLETED: [],
  CANCELED: [],
};
export const fieldId = z.string().trim().min(1).max(160);
const optionalId = fieldId.nullable().optional();
export const workOrderSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(8000).default(""),
    type: z.enum(workOrderTypes),
    priority: z.enum(workOrderPriorities).default("NORMAL"),
    propertyId: fieldId,
    buildingId: optionalId,
    unitId: optionalId,
    meterId: optionalId,
    gatewayId: optionalId,
    scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
    internalContactId: optionalId,
    customerContact: z.string().max(1000).default(""),
    notes: z.string().max(8000).default(""),
  })
  .strict();
export const workOrderPatchSchema = workOrderSchema.partial();
export const checklistSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    items: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            description: z.string().max(2000).default(""),
            required: z.boolean().default(false),
            order: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export const checklistItemSchema = z
  .object({ completed: z.boolean(), comment: z.string().max(2000).default("") })
  .strict();
export const commentSchema = z
  .object({ body: z.string().trim().min(1).max(4000) })
  .strict();
export const assignmentSchema = z.object({ userId: fieldId }).strict();
export const statusSchema = z
  .object({ status: z.enum(workOrderStatuses) })
  .strict();
export const listSchema = z
  .object({
    view: z
      .enum(["all", "mine", "today", "planned", "active", "completed"])
      .default("all"),
  })
  .strict();
export function canManageWorkOrders(role: string) {
  return role === "TENANT_ADMIN" || role === "MANAGER";
}
export function terminal(status: WorkStatus) {
  return status === "COMPLETED" || status === "CANCELED";
}
export function transitionError(
  from: WorkStatus,
  to: WorkStatus,
  context: { scheduled: boolean; assigned: boolean; openRequired: boolean },
): string | null {
  if (!transitions[from].includes(to))
    return "Dieser Statuswechsel ist nicht zulässig.";
  if (to === "PLANNED" && !context.scheduled)
    return "Bitte zuerst einen Termin planen.";
  if ((to === "ASSIGNED" || to === "IN_PROGRESS") && !context.assigned)
    return "Mindestens ein Techniker muss zugewiesen sein.";
  if (to === "COMPLETED" && context.openRequired)
    return "Erforderliche Checklistenpunkte sind noch offen.";
  return null;
}
// UTC is the explicit reporting zone for this first field-service version.
export function todayRange(now = new Date()) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) };
}
