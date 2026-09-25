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
export async function GET() {
  try {
    return NextResponse.json(await getDemoScenario(await requireDemoActor()));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireDemoActor();
    const body = await readBody(request);
    if (body.action === "refresh")
      return NextResponse.json(await refreshDemoData(actor));
    if (body.action === "reset")
      return NextResponse.json(await resetDemoScenario(actor));
    const value = z
      .object({ action: z.literal("scenario"), scenario: z.string() })
      .parse(body);
    return NextResponse.json(await setDemoScenario(actor, value.scenario));
  } catch (error) {
    return failure(error);
  }
}
