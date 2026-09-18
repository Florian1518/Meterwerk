import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { revokeDeviceToken } from "@/server/device-auth";
import { failure } from "@/server/http";
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    await revokeDeviceToken(
      actor,
      id,
      request.nextUrl.searchParams.get("tenantId"),
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
