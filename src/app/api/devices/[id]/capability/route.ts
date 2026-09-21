import { NextRequest } from "next/server";
import { deviceCapability } from "@/server/device-profiles";
import { failure } from "@/server/http";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await deviceCapability(
        (await params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
