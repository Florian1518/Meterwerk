import { NextRequest, NextResponse } from "next/server";
import { queueDeviceCommand } from "@/server/device-fleet";
import { failure, readBody } from "@/server/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await queueDeviceCommand(
        (await params).id,
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
