import { NextRequest } from "next/server";
import { failure } from "@/server/http";
import { benchmark } from "@/server/customer-portal";
export async function GET(request: NextRequest) {
  try {
    return Response.json(
      await benchmark(
        request.nextUrl.searchParams.get("tenantId"),
        Object.fromEntries(request.nextUrl.searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
