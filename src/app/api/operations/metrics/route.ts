import { NextRequest, NextResponse } from "next/server";
import { operationsMetrics } from "@/server/incident-operations";
import { failure } from "@/server/http";
export async function GET(r: NextRequest) {
  try {
    return NextResponse.json(
      await operationsMetrics(r.nextUrl.searchParams.get("tenantId")),
    );
  } catch (e) {
    return failure(e);
  }
}
