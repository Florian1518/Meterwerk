import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { addWidget } from "@/server/dashboards";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    return Response.json(
      await addWidget(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        (await context.params).id,
        body,
      ),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
