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
    if (method === "GET") {
      if (!id || (id === "mine" && path.length === 1)) {
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
        const body = await readBody(request);
        if (method === "POST" && !id)
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
