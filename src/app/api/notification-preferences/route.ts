import { NextRequest } from "next/server";
import { failure, readBody } from "@/server/http";
import { setNotificationPreference } from "@/server/account-security";
export async function POST(request: NextRequest) {
  try {
    return Response.json(
      await setNotificationPreference(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
