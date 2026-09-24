import { NextRequest, NextResponse } from "next/server";
import { setMaintenanceMode } from "@/server/support-operations";
import { failure, readBody } from "@/server/http";
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      await setMaintenanceMode(await readBody(request)),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
