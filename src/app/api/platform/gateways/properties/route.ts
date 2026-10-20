import { NextRequest, NextResponse } from "next/server";
import { gatewayAdminProperties } from "@/server/gateway-admin";
import { failure } from "@/server/http";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await gatewayAdminProperties(
        request.nextUrl.searchParams.get("tenantId") ?? "",
      ),
      { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } },
    );
  } catch (error) {
    return failure(error);
  }
}
