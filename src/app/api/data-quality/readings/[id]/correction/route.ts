import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import { correctReading } from "@/server/data-quality";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await readBody(request);
    const { id } = await params;
    return Response.json(
      await correctReading(
        await requireActor(),
        id,
        typeof body.tenantId === "string" ? body.tenantId : null,
        body,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
