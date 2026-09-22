import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { readingCorrectionHistory } from "@/server/data-quality";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rows = await readingCorrectionHistory(
      await requireActor(),
      id,
      request.nextUrl.searchParams.get("tenantId"),
    );
    return Response.json(rows, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
