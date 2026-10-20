import { NextRequest, NextResponse } from "next/server";
import {
  listGatewayCredentials,
  revokeGatewayCredential,
} from "@/server/gateway-credentials";
import { failure, readBody } from "@/server/http";
const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache" };
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await listGatewayCredentials(
        (await context.params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await revokeGatewayCredential(
        (await context.params).id,
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
