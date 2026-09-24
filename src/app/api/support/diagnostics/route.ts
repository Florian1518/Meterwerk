import { NextRequest, NextResponse } from "next/server";
import {
  tenantDiagnostics,
  diagnosticBundle,
} from "@/server/support-operations";
import { failure } from "@/server/http";
export async function GET(request: NextRequest) {
  try {
    const bundle = request.nextUrl.searchParams.get("bundle") === "true";
    return NextResponse.json(
      await (bundle
        ? diagnosticBundle(request.nextUrl.searchParams.get("tenantId"))
        : tenantDiagnostics(request.nextUrl.searchParams.get("tenantId"))),
    );
  } catch (error) {
    return failure(error);
  }
}
