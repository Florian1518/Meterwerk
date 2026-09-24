import { NextRequest, NextResponse } from "next/server";
import { getSupportCase, updateSupportCase } from "@/server/support-operations";
import { failure, readBody } from "@/server/http";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await getSupportCase(
        (await params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await updateSupportCase(
        (await params).id,
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
