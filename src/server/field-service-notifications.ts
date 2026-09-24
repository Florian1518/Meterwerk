import "server-only";
import { db } from "./db";
import { sendMail } from "./mail";
import { AccessError, tenantScope } from "./policy";
import { requireActor } from "./auth";

export const fieldNotificationEvents = [
  "WORK_ORDER_ASSIGNED",
  "WORK_ORDER_RESCHEDULED",
  "WORK_ORDER_STARTING",
  "WORK_ORDER_OVERDUE",
  "WORK_ORDER_COMPLETED",
  "WORK_ORDER_CANCELED",
  "WORK_ORDER_CRITICAL_DEFECT",
] as const;
export type FieldNotificationEvent = (typeof fieldNotificationEvents)[number];

export async function notifyWorkOrder(
  event: FieldNotificationEvent,
  workOrderId: string,
  requested?: string | null,
  details: Record<string, string> = {},
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const order = await db.workOrder.findFirst({
    where: { id: workOrderId, tenantId, property: { tenantId } },
    select: {
      id: true,
      number: true,
      title: true,
      scheduledAt: true,
      assignments: {
        select: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              tenantId: true,
              active: true,
              notificationPreferences: {
                where: { channel: "EMAIL", event },
                select: { enabled: true },
              },
            },
          },
        },
      },
    },
  });
  if (!order) throw new AccessError(404, "Einsatz nicht gefunden.");
  const subject = `Meterwerk Einsatz ${order.number}: ${event.replaceAll("_", " ")}`;
  const text = `Einsatz ${order.title} (${order.number})\nTermin: ${order.scheduledAt?.toISOString() ?? "nicht geplant"}\nEreignis: ${event}\n${Object.entries(
    details,
  )
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")}`;
  const deliveries = [];
  for (const assignment of order.assignments) {
    const user = assignment.user;
    const enabled = user.notificationPreferences[0]?.enabled ?? true;
    if (user.active && user.tenantId === tenantId && enabled)
      deliveries.push(
        await sendMail({ to: user.email, subject, text, template: "SYSTEM" }),
      );
  }
  await db.auditEvent.create({
    data: {
      tenantId,
      actorId: actor.id,
      entityId: workOrderId,
      action: "work-order.notification",
      details: { event, recipientCount: deliveries.length },
    },
  });
  return {
    event,
    recipientCount: deliveries.length,
    deliveries: deliveries.map((delivery) => ({
      accepted: delivery.accepted,
      provider: delivery.provider,
    })),
  };
}
