import { NextRequest, NextResponse } from "next/server";
import { retryQueueJob } from "@/server/incident-operations";
import { failure, readBody } from "@/server/http";
export async function POST(r: NextRequest) {
  try {
    return NextResponse.json(
      await retryQueueJob(
        await readBody(r),
        r.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
