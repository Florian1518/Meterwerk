import { NextRequest, NextResponse } from "next/server";
import { getDeviceDetail, updateDevice } from "@/server/device-management";
import { failure, readBody } from "@/server/http";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await getDeviceDetail(
        (await params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await updateDevice(
        (await params).id,
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
