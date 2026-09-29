import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { failure, readBody } from "@/server/http";
import {
  getDemoScenario,
  refreshDemoData,
  resetDemoScenario,
  setDemoScenario,
  requireDemoActor,
} from "@/server/demo-scenarios";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await getDemoScenario(
        await requireDemoActor(),
        request.nextUrl.searchParams.get("tenantId") ?? undefined,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireDemoActor();
    const body = await readBody(request);
    const tenantId = z.string().min(1).parse(body.tenantId);
    if (body.action === "refresh")
      return NextResponse.json(await refreshDemoData(actor, tenantId));
    if (body.action === "reset")
      return NextResponse.json(await resetDemoScenario(actor, tenantId));
    const value = z
      .object({ action: z.literal("scenario"), scenario: z.string() })
      .parse(body);
    return NextResponse.json(
      await setDemoScenario(actor, value.scenario, tenantId),
    );
  } catch (error) {
    return failure(error);
  }
}
