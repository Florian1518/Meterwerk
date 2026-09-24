import { NextRequest, NextResponse } from "next/server";
import { deviceDiagnostics } from "@/server/device-fleet";
import { failure } from "@/server/http";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await deviceDiagnostics(
        (await params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
