import { NextRequest } from "next/server";
import { createTariff } from "@/server/utility";
import { failure, readBody } from "@/server/http";
export async function POST(request: NextRequest) {
  try {
    return Response.json(
      await createTariff(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
