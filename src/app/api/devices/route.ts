import { NextRequest, NextResponse } from "next/server";
import { createDevice, listDevices } from "@/server/device-management";
import { failure, readBody } from "@/server/http";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await listDevices(
        Object.fromEntries(request.nextUrl.searchParams),
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
    return NextResponse.json(
      await createDevice(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
