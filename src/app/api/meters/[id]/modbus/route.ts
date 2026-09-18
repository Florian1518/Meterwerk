import { NextRequest, NextResponse } from "next/server";
import { readModbus, writeModbus } from "@/server/modbus";
import { failure, readBody } from "@/server/http";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await readModbus(
        (await params).id,
        request.nextUrl.searchParams.get("tenantId"),
        request.nextUrl.searchParams.get("debug") === "true",
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await writeModbus(
        (await params).id,
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
