import { NextRequest, NextResponse } from "next/server";
import { systemStatus } from "@/server/system-status";
import { failure } from "@/server/http";
export async function GET(request: NextRequest) {
  try {
    const value = await systemStatus(
      request.nextUrl.searchParams.get("tenantId"),
    );
    return NextResponse.json(value, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
