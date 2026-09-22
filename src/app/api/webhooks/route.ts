import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { createWebhook, listWebhooks } from "@/server/webhooks";

export async function GET(request: NextRequest) {
  try {
    return Response.json(
      await listWebhooks(
        await requireActor(),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return Response.json(
      await createWebhook(await requireActor(), await readBody(request)),
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
