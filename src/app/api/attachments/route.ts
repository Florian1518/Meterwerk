import { NextRequest } from "next/server";
import { assertOrigin, failure } from "@/server/http";
import { storeAttachment } from "@/server/attachments";
import { requireActor } from "@/server/auth";
import { AccessError } from "@/server/policy";
import { attachmentMaxBytes } from "@/lib/attachment-validation";
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    await requireActor();
    const reader = request.body?.getReader();
    if (!reader) throw new AccessError(400, "Datei fehlt.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > attachmentMaxBytes + 65536) {
          await reader.cancel();
          throw new AccessError(413, "Upload zu groß.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      body: Buffer.concat(chunks),
    });
    return Response.json(
      await storeAttachment(
        await body.formData(),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
