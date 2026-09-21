import { NextRequest } from "next/server";
import { failure, readBody } from "@/server/http";
import { addNote } from "@/server/customer-portal";
export async function POST(request: NextRequest) {
  try {
    return Response.json(
      await addNote(
        await readBody(request),
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
