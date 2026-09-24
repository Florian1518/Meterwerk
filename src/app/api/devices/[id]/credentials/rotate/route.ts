import { NextRequest, NextResponse } from "next/server";
import { rotateDeviceCredential } from "@/server/device-fleet";
import { failure } from "@/server/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await rotateDeviceCredential(
        (await params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
