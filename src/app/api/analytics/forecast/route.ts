import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { forecast } from "@/server/analytics-forecast";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    const p = request.nextUrl.searchParams;
    return Response.json(
      await forecast(actor, p.get("tenantId"), {
        asOf: p.get("asOf") ?? undefined,
        horizon: p.get("horizon"),
        meterId: p.get("meterId") ?? undefined,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
