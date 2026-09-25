import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { assertOrigin, failure } from "@/server/http";
import { rotateWebhookSecret } from "@/server/webhooks";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    return Response.json(
      await rotateWebhookSecret(
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
