import { NextRequest, NextResponse } from "next/server";
import { failure } from "@/server/http";
import { listAdminGateways } from "@/server/gateway-admin";
const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache" };
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await listAdminGateways(Object.fromEntries(request.nextUrl.searchParams)),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
