import { NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { platformOverview } from "@/server/platform-admin";
export async function GET() {
  try {
    return NextResponse.json(await platformOverview(await requireActor()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
