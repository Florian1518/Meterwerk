import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import {
  deleteDashboard,
  updateDashboard,
  duplicateDashboard,
} from "@/server/dashboards";
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    return Response.json(
      await updateDashboard(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        (await context.params).id,
        body,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    return Response.json(
      await deleteDashboard(
        actor,
        request.nextUrl.searchParams.get("tenantId"),
        (await context.params).id,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    return Response.json(
      await duplicateDashboard(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        (await context.params).id,
        typeof body.name === "string" ? body.name : undefined,
      ),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
