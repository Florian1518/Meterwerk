import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { deleteRule, ruleExecutions, updateRule } from "@/server/rules";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    const { id } = await context.params;
    return Response.json(
      await updateRule(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        id,
        body,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    return Response.json(
      await deleteRule(actor, request.nextUrl.searchParams.get("tenantId"), id),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    return Response.json(
      await ruleExecutions(
        actor,
        request.nextUrl.searchParams.get("tenantId"),
        id,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
