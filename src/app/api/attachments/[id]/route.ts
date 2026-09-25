import { NextRequest } from "next/server";
import { failure } from "@/server/http";
import { authorizeAttachment, readAttachment } from "@/server/attachments";
import { signedAttachmentToken, verifyAttachmentToken } from "@/server/storage";
import { AccessError } from "@/server/policy";
import { downloadDisposition } from "@/lib/report-security";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const requested = request.nextUrl.searchParams.get("tenantId");
    const { actor, tenantId } = await authorizeAttachment(id, requested);
    const identity = `${tenantId}:${actor.id}:${id}`;
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      const url = new URL(request.url);
      url.searchParams.set(
        "token",
        signedAttachmentToken(identity, new Date(Date.now() + 60_000)),
      );
      return new Response(null, {
        status: 307,
        headers: {
          Location: url.pathname + url.search,
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (!verifyAttachmentToken(identity, token))
      throw new AccessError(404, "Datei nicht gefunden.");
    const file = await readAttachment(
      id,
      request.nextUrl.searchParams.get("tenantId"),
    );
    return new Response(file.data, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": downloadDisposition(file.fileName),
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
