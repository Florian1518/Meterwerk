import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { createTemplate } from "@/server/dashboards";
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const body = (await request.json()) as {
      tenantId?: string;
      template?: string;
    };
    return Response.json(
      await createTemplate(
        actor,
        body.tenantId ?? null,
        body.template ?? "ENERGY",
      ),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
