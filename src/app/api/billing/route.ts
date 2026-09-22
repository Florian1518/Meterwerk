import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { tenantBilling, tenantUsage } from "@/server/licensing";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const [subscription, usage] = await Promise.all([
      tenantBilling(actor, tenantId),
      tenantUsage(actor, tenantId),
    ]);
    return Response.json({ subscription, usage });
  } catch (error) {
    return failure(error);
  }
}
