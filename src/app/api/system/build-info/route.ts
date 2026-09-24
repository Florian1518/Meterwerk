import { NextResponse } from "next/server";
import { buildMetadata } from "@/lib/build-metadata";
export function GET() {
  return NextResponse.json(buildMetadata(), {
    headers: { "Cache-Control": "no-store" },
  });
}
