import { NextRequest } from "next/server";
import { failure, readBody } from "@/server/http";
import { createReport, listReports } from "@/server/customer-portal";
export async function GET(request: NextRequest) {
  try {
    return Response.json(
      await listReports(request.nextUrl.searchParams.get("tenantId")),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    return Response.json(
      await createReport(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
