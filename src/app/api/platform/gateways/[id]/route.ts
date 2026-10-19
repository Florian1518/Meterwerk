import { NextRequest, NextResponse } from "next/server";
import { failure } from "@/server/http";
import { getAdminGateway } from "@/server/gateway-admin";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await getAdminGateway(
        (await params).id,
        request.nextUrl.searchParams.get("tenantId") ?? undefined,
      ),
      { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } },
    );
  } catch (error) {
    return failure(error);
  }
}
