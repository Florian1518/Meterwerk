import { NextResponse } from "next/server";
import { failure } from "@/server/http";
import { metricsSnapshot } from "@/server/observability";
import { requireActor } from "@/server/auth";
import { requirePlatform } from "@/server/policy";
export async function GET() {
  try {
    const actor = await requireActor();
    requirePlatform(actor);
    return NextResponse.json(
      {
        metrics: metricsSnapshot(),
        process: {
          uptimeSeconds: process.uptime(),
          rssBytes: process.memoryUsage().rss,
        },
        asOf: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
