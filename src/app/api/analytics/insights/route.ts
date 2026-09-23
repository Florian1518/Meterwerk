import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import {
  anomalies,
  benchmarks,
  listAnomalies,
  persistDetectedAnomalies,
} from "@/server/analytics-insights";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    const p = request.nextUrl.searchParams;
    const raw = {
      from: p.get("from"),
      to: p.get("to"),
      timezone: p.get("timezone") ?? "UTC",
      meterId: p.get("meterId") ?? undefined,
      propertyId: p.get("propertyId") ?? undefined,
    };
    const requested = p.get("tenantId");
    const kind = p.get("kind") ?? "anomalies";
    return Response.json(
      kind === "benchmarks"
        ? await benchmarks(actor, requested, raw)
        : kind === "persisted"
          ? await listAnomalies(actor, requested, {
              status: p.get("status") ?? undefined,
            })
          : await anomalies(actor, requested, raw),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    return Response.json(
      await persistDetectedAnomalies(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        body,
      ),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
