import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { getMeter } from "@/server/data";
import { AccessError } from "@/server/policy";
import { mutate } from "@/server/mutations";
import { failure, readBody } from "@/server/http";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    return NextResponse.json(
      {
        data: await getMeter(
          actor,
          id,
          request.nextUrl.searchParams.get("tenantId"),
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AccessError
            ? error.message
            : "Interner Serverfehler.",
      },
      { status: error instanceof AccessError ? error.status : 500 },
    );
  }
}
async function write(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  operation: "update" | "delete",
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const input = await readBody(request);
    return NextResponse.json({
      data: await mutate(
        actor,
        { ...input, kind: "meters", id, operation },
        request.nextUrl.searchParams.get("tenantId"),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return write(request, context, "update");
}
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return write(request, context, "delete");
}
