import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { assertOrigin, failure } from "@/server/http";
import { rotatePublicApiKey } from "@/server/public-api";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    return Response.json(
      await rotatePublicApiKey(
        await requireActor(),
        (await params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
