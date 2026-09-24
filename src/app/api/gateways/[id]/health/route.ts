import { NextRequest, NextResponse } from "next/server";
import { gatewayHealth } from "@/server/device-fleet-part3";
import { failure } from "@/server/http";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await gatewayHealth(
        (await params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
