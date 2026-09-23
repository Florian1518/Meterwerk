import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { widgetData } from "@/server/dashboards";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; widgetId: string }> },
) {
  try {
    const actor = await requireActor();
    const p = await context.params;
    return Response.json(
      await widgetData(
        actor,
        request.nextUrl.searchParams.get("tenantId"),
        p.id,
        p.widgetId,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
