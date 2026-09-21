import { NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { listPlatformTenants } from "@/server/platform-admin";
export async function GET() {
  try {
    return NextResponse.json(await listPlatformTenants(await requireActor()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
