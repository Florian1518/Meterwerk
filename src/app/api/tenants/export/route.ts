import { NextRequest } from "next/server";
import { failure } from "@/server/http";
import { tenantExport } from "@/server/customer-portal";
export async function GET(request: NextRequest) {
  try {
    return Response.json(
      await tenantExport(request.nextUrl.searchParams.get("tenantId")),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
