import { NextRequest, NextResponse } from "next/server";
import { createMaintenanceWindow } from "@/server/device-fleet";
import { failure, readBody } from "@/server/http";
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      await createMaintenanceWindow(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
