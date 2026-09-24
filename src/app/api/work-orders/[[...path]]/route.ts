import {
  saveFieldDocumentation,
  listChecklistTemplates,
  saveChecklistTemplate,
} from "@/server/field-documentation";
import {
  calendarWorkOrders,
  changeAddendumStatus,
  createAddendum,
  listAddenda,
  rescheduleWorkOrder,
} from "@/server/field-service-planning";
import {
  fieldNotificationEvents,
  notifyWorkOrder,
} from "@/server/field-service-notifications";
import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { AccessError } from "@/server/policy";
import { assertOrigin, failure, readBody } from "@/server/http";
import {
  addChecklist,
  addWorkOrderComment,
  assignTechnician,
  changeWorkOrderStatus,
  completeChecklistItem,
  createWorkOrder,
  deleteWorkOrder,
  fieldServiceOptions,
  getWorkOrder,
  listWorkOrders,
  updateWorkOrder,
} from "@/server/field-service";

type Context = { params: Promise<{ path?: string[] }> };
async function handle(request: NextRequest, context: Context) {
  try {
    await requireActor();
    const { path = [] } = await context.params;
    const [id, resource, child] = path;
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const method = request.method;
    let result: unknown;
    let mutationBody: Record<string, unknown> | null = null;
    if (method === "GET") {
      if (id === "calendar" && path.length === 1)
        result = await calendarWorkOrders(
          {
            from:
              request.nextUrl.searchParams.get("from") ??
              `${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
            to:
              request.nextUrl.searchParams.get("to") ??
              `${new Date().toISOString().slice(0, 10)}T23:59:59Z`,
            technicianId: request.nextUrl.searchParams.get("technicianId"),
            status: request.nextUrl.searchParams.get("status") ?? undefined,
            priority: request.nextUrl.searchParams.get("priority") ?? undefined,
            propertyId: request.nextUrl.searchParams.get("propertyId"),
          },
          tenantId,
        );
      else if (id === "templates" && path.length === 1)
        result = await listChecklistTemplates(tenantId);
      else if (!id || (id === "mine" && path.length === 1)) {
        const view =
          request.nextUrl.searchParams.get("view") ||
          (id === "mine" ? "mine" : "all");
        if (id === "mine" && view === "all")
          throw new AccessError(
            400,
            "Meine Einsätze benötigt einen persönlichen Filter.",
          );
        result = await listWorkOrders(tenantId, { view });
      } else if (id === "options" && path.length === 1)
        result = await fieldServiceOptions(tenantId);
      else if (path.length === 1) result = await getWorkOrder(id, tenantId);
      else if (path.length === 2 && resource === "addenda")
        result = await listAddenda(id, tenantId);
      else if (
        path.length === 2 &&
        ["assignments", "checklists", "comments", "history"].includes(resource)
      ) {
        const order = await getWorkOrder(id, tenantId);
        result =
          order[
            resource as "assignments" | "checklists" | "comments" | "history"
          ];
      } else throw new AccessError(404, "API-Pfad nicht gefunden.");
    } else {
      assertOrigin(request);
      if (method === "DELETE" && id && path.length === 1)
        result = await deleteWorkOrder(id, tenantId);
      else if (
        method === "DELETE" &&
        path.length === 3 &&
        resource === "assignments"
      )
        result = await assignTechnician(id, { userId: child }, true, tenantId);
      else {
        const body = await readBody(
          request,
          resource === "documentation" ? 131072 : 16384,
        );
        mutationBody = body;
        if (
          id === "templates" &&
          (method === "POST" || method === "PATCH") &&
          path.length <= 2
        )
          result = await saveChecklistTemplate(body, tenantId, resource);
        else if (
          method === "POST" &&
          path.length === 2 &&
          resource === "documentation"
        )
          result = await saveFieldDocumentation(id, body, tenantId);
        else if (
          method === "POST" &&
          path.length === 2 &&
          resource === "addenda"
        )
          result = await createAddendum(id, body, tenantId);
        else if (
          method === "POST" &&
          path.length === 2 &&
          resource === "notify"
        ) {
          if (
            !fieldNotificationEvents.includes(
              body.event as (typeof fieldNotificationEvents)[number],
            )
          )
            throw new AccessError(
              400,
              "Unbekanntes Benachrichtigungsereignis.",
            );
          result = await notifyWorkOrder(
            body.event as (typeof fieldNotificationEvents)[number],
            id,
            tenantId,
            typeof body.details === "object" && body.details
              ? (body.details as Record<string, string>)
              : {},
          );
        } else if (
          method === "PATCH" &&
          path.length === 2 &&
          resource === "schedule"
        )
          result = await rescheduleWorkOrder(
            id,
            typeof body.scheduledAt === "string" ? body.scheduledAt : "",
            tenantId,
          );
        else if (
          method === "PATCH" &&
          path.length === 3 &&
          resource === "addenda"
        )
          result = await changeAddendumStatus(child, body, tenantId);
        else if (method === "POST" && !id)
          result = await createWorkOrder(body, tenantId);
        else if (method === "PATCH" && path.length === 1)
          result = await updateWorkOrder(id, body, tenantId);
        else if (
          method === "POST" &&
          path.length === 2 &&
          resource === "assignments"
        )
          result = await assignTechnician(id, body, false, tenantId);
        else if (
          method === "POST" &&
          path.length === 2 &&
          resource === "status"
        )
          result = await changeWorkOrderStatus(id, body, tenantId);
        else if (
          method === "POST" &&
          path.length === 2 &&
          resource === "checklists"
        )
          result = await addChecklist(id, body, tenantId);
        else if (
          method === "PATCH" &&
          path.length === 3 &&
          resource === "checklist-items"
        )
          result = await completeChecklistItem(id, child, body, tenantId);
        else if (
          method === "POST" &&
          path.length === 2 &&
          resource === "comments"
        )
          result = await addWorkOrderComment(id, body, tenantId);
        else throw new AccessError(404, "API-Pfad nicht gefunden.");
      }
    }
    if (method === "POST" && id && resource === "assignments")
      await notifyWorkOrder("WORK_ORDER_ASSIGNED", id, tenantId);
    if (method === "PATCH" && id && resource === "schedule")
      await notifyWorkOrder("WORK_ORDER_RESCHEDULED", id, tenantId);
    if (
      method === "POST" &&
      id &&
      resource === "status" &&
      mutationBody?.status === "COMPLETED"
    )
      await notifyWorkOrder("WORK_ORDER_COMPLETED", id, tenantId);
    if (
      method === "POST" &&
      id &&
      resource === "status" &&
      mutationBody?.status === "CANCELED"
    )
      await notifyWorkOrder("WORK_ORDER_CANCELED", id, tenantId);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
