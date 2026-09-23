import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { runScheduledRules } from "@/server/rules";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    const now =
      body.now === undefined
        ? new Date()
        : new Date(z.string().datetime({ offset: true }).parse(body.now));
    return Response.json(
      await runScheduledRules(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : null,
        now,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
