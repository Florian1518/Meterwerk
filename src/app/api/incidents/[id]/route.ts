import { NextRequest, NextResponse } from "next/server";
import { updateIncident } from "@/server/incident-operations";
import { failure, readBody } from "@/server/http";
export async function PATCH(
  r: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await updateIncident(
        (await params).id,
        await readBody(r),
        r.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
