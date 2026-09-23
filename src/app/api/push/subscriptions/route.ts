import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { revokePushSubscription, savePushSubscription } from "@/server/push";
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    return Response.json(
      await savePushSubscription(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        body,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireActor();
    const endpoint = request.nextUrl.searchParams.get("endpoint");
    if (!endpoint)
      return Response.json({ error: "Endpoint fehlt." }, { status: 400 });
    return Response.json(
      await revokePushSubscription(
        actor,
        request.nextUrl.searchParams.get("tenantId"),
        endpoint,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
