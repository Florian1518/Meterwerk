import { NextRequest, NextResponse } from "next/server";
import { fleetOverview } from "@/server/device-fleet";
import { failure } from "@/server/http";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await fleetOverview(
        Object.fromEntries(request.nextUrl.searchParams),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
