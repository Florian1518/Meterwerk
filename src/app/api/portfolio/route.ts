import { NextRequest } from "next/server";
import { failure } from "@/server/http";
import { portfolio } from "@/server/customer-portal";
export async function GET(request: NextRequest) {
  try {
    return Response.json(
      await portfolio(request.nextUrl.searchParams.get("tenantId")),
    );
  } catch (e) {
    return failure(e);
  }
}
