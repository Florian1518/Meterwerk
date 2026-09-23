import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { bulkDataQuality } from "@/server/data-quality";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    return Response.json(
      await bulkDataQuality(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        body,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
