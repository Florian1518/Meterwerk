import { NextRequest, NextResponse } from "next/server";
import { changeDeviceLifecycle } from "@/server/device-management";
import { failure, readBody } from "@/server/http";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await readBody(request);
    return NextResponse.json(
      await changeDeviceLifecycle(
        (await params).id,
        String(body.status ?? ""),
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
