import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { listResource, listTenants, resources } from "@/server/data";
import { mutate } from "@/server/mutations";
import { AccessError } from "@/server/policy";
import { failure, readBody } from "@/server/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const actor = await requireActor();
    const { resource } = await context.params;
    if (
      resource !== "tenants" &&
      !resources.includes(resource as (typeof resources)[number])
    )
      throw new AccessError(404, "Schnittstelle nicht gefunden.");
    const data =
      resource === "tenants"
        ? await listTenants(actor)
        : await listResource(
            actor,
            resource as (typeof resources)[number],
            request.nextUrl.searchParams.get("tenantId"),
          );
    return NextResponse.json(
      { data, limit: 200 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const actor = await requireActor();
    const input = await readBody(request);
    const { resource } = await context.params;
    const data = await mutate(
      actor,
      { ...input, kind: resource, operation: "create" },
      request.nextUrl.searchParams.get("tenantId"),
    );
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
