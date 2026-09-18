import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { issueDeviceToken } from "@/server/device-auth";
import { failure } from "@/server/http";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const result = await issueDeviceToken(
      actor,
      { deviceId: id },
      request.nextUrl.searchParams.get("tenantId"),
    );
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
