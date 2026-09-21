import { NextRequest } from "next/server";
import { failure, readBody } from "@/server/http";
import { requestPasswordReset, resetPassword } from "@/server/account-security";
export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    return Response.json(
      request.nextUrl.searchParams.has("token")
        ? await resetPassword(body)
        : await requestPasswordReset(body),
    );
  } catch (e) {
    return failure(e);
  }
}
