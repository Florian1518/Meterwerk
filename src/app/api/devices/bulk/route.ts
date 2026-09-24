import { NextRequest, NextResponse } from "next/server";
import { bulkDeviceAction } from "@/server/device-management";
import { failure, readBody } from "@/server/http";
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      await bulkDeviceAction(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
