import { NextRequest, NextResponse } from "next/server";
import { createFirmwareRollout } from "@/server/device-fleet";
import { failure, readBody } from "@/server/http";
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      await createFirmwareRollout(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
