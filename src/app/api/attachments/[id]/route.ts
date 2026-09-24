import { NextRequest } from "next/server";
import { failure } from "@/server/http";
import { readAttachment } from "@/server/attachments";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const file = await readAttachment(
      id,
      request.nextUrl.searchParams.get("tenantId"),
    );
    return new Response(file.data, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
