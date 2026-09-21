import { NextResponse } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { tenantSupport } from "@/server/platform-admin";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await tenantSupport(await requireActor(), (await params).id),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
