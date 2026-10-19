import { NextRequest, NextResponse } from "next/server";
import { failure } from "@/server/http";
import { listAdminDevices } from "@/server/gateway-admin";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await listAdminDevices(Object.fromEntries(request.nextUrl.searchParams)),
      { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } },
    );
  } catch (error) {
    return failure(error);
  }
}
