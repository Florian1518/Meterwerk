import { NextRequest } from "next/server";
import { failure } from "@/server/http";
import { ingestProtocolReading } from "@/server/protocol-ingestion";
export async function POST(request: NextRequest) {
  try {
    return Response.json(
      await ingestProtocolReading(
        request.headers.get("authorization"),
        await request.json(),
        request.headers.get("x-correlation-id") ?? undefined,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
