import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { scanDataQuality } from "@/server/data-quality";

export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    return Response.json(
      await scanDataQuality(
        await requireActor(),
        typeof body.tenantId === "string" ? body.tenantId : null,
        body,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
