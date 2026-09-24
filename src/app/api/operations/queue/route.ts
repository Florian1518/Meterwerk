import { NextRequest, NextResponse } from "next/server";
import { operationsMetrics } from "@/server/incident-operations";
import { failure } from "@/server/http";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await operationsMetrics(request.nextUrl.searchParams.get("tenantId")),
    );
  } catch (error) {
    return failure(error);
  }
}
