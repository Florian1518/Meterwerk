import { NextRequest } from "next/server";
import { failure, readBody } from "@/server/http";
import { createInvitation, acceptInvitation } from "@/server/account-security";
export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    return Response.json(
      request.nextUrl.searchParams.has("token")
        ? await acceptInvitation(body)
        : await createInvitation(
            body,
            request.nextUrl.searchParams.get("tenantId"),
          ),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
