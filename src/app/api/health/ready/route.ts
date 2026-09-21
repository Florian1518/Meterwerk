import { NextResponse } from "next/server";
import { failure } from "@/server/http";
import { readyHealth } from "@/server/observability";
export async function GET() {
  try {
    return NextResponse.json(await readyHealth(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
