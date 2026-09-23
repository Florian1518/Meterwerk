import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { updateAnomaly } from "@/server/analytics-insights";
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    return Response.json(
      await updateAnomaly(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        (await context.params).id,
        body,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
