import { NextRequest, NextResponse } from "next/server";
import { createDeviceGroup } from "@/server/device-fleet-part3";
import { failure, readBody } from "@/server/http";
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      await createDeviceGroup(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
