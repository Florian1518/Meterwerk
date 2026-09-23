import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { skipImportErrors } from "@/server/data-imports";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    const { id } = await context.params;
    return Response.json(
      await skipImportErrors(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        id,
        body,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
