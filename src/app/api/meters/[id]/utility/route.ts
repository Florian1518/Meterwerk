import { NextRequest } from "next/server";
import { configureUtility, utilityDetail } from "@/server/utility";
import { failure, readBody } from "@/server/http";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await utilityDetail(
        (await context.params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await configureUtility(
        (await context.params).id,
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
