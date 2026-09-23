import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { createRule, listRules } from "@/server/rules";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    return Response.json(
      await listRules(actor, request.nextUrl.searchParams.get("tenantId")),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    return Response.json(
      await createRule(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        body,
      ),
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
