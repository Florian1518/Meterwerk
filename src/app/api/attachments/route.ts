import { NextRequest } from "next/server";
import { assertOrigin, failure } from "@/server/http";
import { storeAttachment } from "@/server/attachments";
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    return Response.json(
      await storeAttachment(
        await request.formData(),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
