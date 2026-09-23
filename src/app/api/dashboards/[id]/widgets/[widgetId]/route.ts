import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { removeWidget, updateWidget } from "@/server/dashboards";
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; widgetId: string }> },
) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    const p = await context.params;
    return Response.json(
      await updateWidget(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        p.id,
        p.widgetId,
        body,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; widgetId: string }> },
) {
  try {
    const actor = await requireActor();
    const p = await context.params;
    return Response.json(
      await removeWidget(
        actor,
        request.nextUrl.searchParams.get("tenantId"),
        p.id,
        p.widgetId,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
