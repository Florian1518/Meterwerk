import { NextRequest } from "next/server";
import { failure, readBody } from "@/server/http";
import { setAlarmStatus } from "@/server/customer-portal";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await readBody(request);
    return Response.json(
      await setAlarmStatus(
        id,
        body.status as "ACKNOWLEDGED" | "RESOLVED",
        typeof body.comment === "string" ? body.comment : undefined,
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
