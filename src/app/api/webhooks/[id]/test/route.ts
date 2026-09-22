import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { queueWebhookTest } from "@/server/webhooks";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const actor = await requireActor();
    await readBody(request);
    return Response.json(
      await queueWebhookTest(
        actor,
        id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
