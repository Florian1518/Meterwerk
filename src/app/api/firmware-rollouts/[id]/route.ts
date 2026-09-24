import { NextRequest, NextResponse } from "next/server";
import { updateRollout } from "@/server/device-fleet-part3";
import { failure, readBody } from "@/server/http";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await updateRollout(
        (await params).id,
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
