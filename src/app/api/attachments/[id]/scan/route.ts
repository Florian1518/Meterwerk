import { NextRequest } from "next/server";
import { assertOrigin, failure } from "@/server/http";
import { rescanAttachment } from "@/server/attachments";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    return Response.json(
      await rescanAttachment(
        (await params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
