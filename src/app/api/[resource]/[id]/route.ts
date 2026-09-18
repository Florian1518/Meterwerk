import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { listResource, resources } from "@/server/data";
import { db } from "@/server/db";
import { AccessError, requirePlatform } from "@/server/policy";
import { failure, readBody } from "@/server/http";
import { mutate } from "@/server/mutations";
type Context = { params: Promise<{ resource: string; id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const actor = await requireActor();
    const { resource, id } = await context.params;
    let data: unknown;
    if (resource === "tenants") {
      requirePlatform(actor);
      data = await db.tenant.findUnique({ where: { id } });
    } else {
      if (!resources.includes(resource as (typeof resources)[number]))
        throw new AccessError(404, "Schnittstelle nicht gefunden.");
      data = (
        await listResource(
          actor,
          resource as (typeof resources)[number],
          request.nextUrl.searchParams.get("tenantId"),
          id,
        )
      )[0];
    }
    if (!data) throw new AccessError(404, "Eintrag nicht gefunden.");
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
async function write(
  request: NextRequest,
  context: Context,
  operation: "update" | "delete",
) {
  try {
    const actor = await requireActor();
    const { resource, id } = await context.params;
    const input = await readBody(request);
    const data = await mutate(
      actor,
      { ...input, kind: resource, id, operation },
      request.nextUrl.searchParams.get("tenantId"),
    );
    return NextResponse.json({ data });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: NextRequest, context: Context) {
  return write(request, context, "update");
}
export async function DELETE(request: NextRequest, context: Context) {
  return write(request, context, "delete");
}
