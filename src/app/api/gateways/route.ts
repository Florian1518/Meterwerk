import { NextRequest, NextResponse } from "next/server";
import { createPilotGateway } from "@/server/gateway-credentials";
import { failure, readBody } from "@/server/http";
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      await createPilotGateway(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
