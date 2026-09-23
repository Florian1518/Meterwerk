import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { exportDashboard } from "@/server/dashboards";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const csv = await exportDashboard(
      actor,
      request.nextUrl.searchParams.get("tenantId"),
      (await context.params).id,
    );
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=dashboard.csv",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
