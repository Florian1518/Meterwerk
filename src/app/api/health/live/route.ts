import { NextResponse } from "next/server";
import { liveHealth } from "@/server/observability";
export async function GET() {
  return NextResponse.json(await liveHealth(), {
    headers: { "Cache-Control": "no-store" },
  });
}
