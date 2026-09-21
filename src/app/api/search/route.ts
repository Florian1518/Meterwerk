import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { globalSearch } from "@/server/global-search";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    return NextResponse.json(
      await globalSearch(
        actor,
        request.nextUrl.searchParams.get("q") ?? "",
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { headers: { "Cache-Control": "private, max-age=10" } },
    );
  } catch (error) {
    return failure(error);
  }
}
