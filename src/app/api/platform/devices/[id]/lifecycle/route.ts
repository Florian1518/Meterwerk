import { NextRequest, NextResponse } from "next/server";
import { failure, readBody } from "@/server/http";
import { decommissionAdminDevice } from "@/server/gateway-admin";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await decommissionAdminDevice((await params).id, await readBody(request)),
      { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } },
    );
  } catch (error) {
    return failure(error);
  }
}
