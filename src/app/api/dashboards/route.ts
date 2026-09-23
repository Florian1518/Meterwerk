import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { createDashboard, listDashboards } from "@/server/dashboards";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    return Response.json(
      await listDashboards(actor, request.nextUrl.searchParams.get("tenantId")),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    return Response.json(
      await createDashboard(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        body,
      ),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
