import { NextRequest, NextResponse } from "next/server";
import { createIncident, listIncidents } from "@/server/incident-operations";
import { failure, readBody } from "@/server/http";
export async function GET(r: NextRequest) {
  try {
    return NextResponse.json(
      await listIncidents(r.nextUrl.searchParams.get("tenantId")),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    return NextResponse.json(
      await createIncident(
        await readBody(r),
        r.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
