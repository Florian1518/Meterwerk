import { NextRequest } from "next/server";
import { failure, readBody } from "@/server/http";
import { requireActor } from "@/server/auth";
import { confirmCsvImport } from "@/server/data-imports";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await readBody(request);
    const { id } = await params;
    return Response.json(
      await confirmCsvImport(
        await requireActor(),
        id,
        typeof body.tenantId === "string" ? body.tenantId : null,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
