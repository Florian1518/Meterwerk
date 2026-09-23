import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { importHistory } from "@/server/data-imports";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    const query = request.nextUrl.searchParams;
    return Response.json(
      await importHistory(
        actor,
        query.get("tenantId"),
        Object.fromEntries(query),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
