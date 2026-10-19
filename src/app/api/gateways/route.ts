import { NextRequest, NextResponse } from "next/server";
import { createPilotGateway } from "@/server/gateway-credentials";
import { prepareAdminGateway } from "@/server/gateway-admin";
import { failure, readBody } from "@/server/http";
export async function POST(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("platformAdmin") === "1")
      return NextResponse.json(
        await prepareAdminGateway(
          request.nextUrl.searchParams.get("tenantId") ?? "",
          await readBody(request),
        ),
        { status: 201, headers: { "Cache-Control": "private, no-store" } },
      );
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
