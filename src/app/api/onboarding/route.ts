import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { readBody, failure } from "@/server/http";
import { getOnboardingStatus, markOnboardingLive } from "@/server/onboarding";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    return NextResponse.json(
      await getOnboardingStatus(
        actor,
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const body = await readBody(request);
    return NextResponse.json(
      await markOnboardingLive(
        actor,
        typeof body.tenantId === "string" ? body.tenantId : undefined,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
