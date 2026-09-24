import { NextRequest, NextResponse } from "next/server";
import {
  createSupportCase,
  listSupportCases,
} from "@/server/support-operations";
import { failure, readBody } from "@/server/http";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await listSupportCases(
        Object.fromEntries(request.nextUrl.searchParams),
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      await createSupportCase(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
