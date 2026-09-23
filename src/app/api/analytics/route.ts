import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { analytics } from "@/server/analytics";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    const params = request.nextUrl.searchParams;
    return Response.json(
      await analytics(actor, params.get("tenantId"), {
        from: params.get("from"),
        to: params.get("to"),
        resolution: params.get("resolution"),
        timezone: params.get("timezone") ?? "UTC",
        meterId: params.get("meterId") ?? undefined,
        propertyId: params.get("propertyId") ?? undefined,
        portfolio: params.get("portfolio") === "true",
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
