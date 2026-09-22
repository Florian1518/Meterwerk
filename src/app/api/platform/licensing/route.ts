import { NextRequest } from "next/server";
import { failure, readBody } from "@/server/http";
import { requireActor } from "@/server/auth";
import {
  changePlan,
  listPlans,
  setFeatureOverride,
  setPlanOverride,
  tenantSubscription,
  tenantUsage,
  extendTrial,
  setBillingMetadata,
  setSubscriptionStatus,
} from "@/server/licensing";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (request.nextUrl.searchParams.get("usage") === "true")
      return Response.json(await tenantUsage(actor, tenantId));
    if (tenantId)
      return Response.json(await tenantSubscription(actor, tenantId));
    return Response.json(await listPlans(actor));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const body = (await readBody(request)) as { operation?: string } & Record<
      string,
      unknown
    >;
    if (body.operation === "plan")
      return Response.json(await changePlan(actor, body), { status: 201 });
    if (body.operation === "featureOverride")
      return Response.json(await setFeatureOverride(actor, body));
    if (body.operation === "limitOverride")
      return Response.json(await setPlanOverride(actor, body));
    if (body.operation === "status")
      return Response.json(await setSubscriptionStatus(actor, body));
    if (body.operation === "extendTrial")
      return Response.json(await extendTrial(actor, body));
    if (body.operation === "billingMetadata")
      return Response.json(await setBillingMetadata(actor, body));
    return Response.json(
      { error: "Unbekannte Lizenzoperation." },
      { status: 400 },
    );
  } catch (error) {
    return failure(error);
  }
}
