import { NextRequest } from "next/server";
import { replaceMeter } from "@/server/meter-replacement";
import { failure, readBody } from "@/server/http";
export async function POST(request: NextRequest) {
  try {
    return Response.json(
      await replaceMeter(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
