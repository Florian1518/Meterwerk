import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure, readBody } from "@/server/http";
import {
  createPublicApiKey,
  listPublicApiKeys,
  revokePublicApiKey,
} from "@/server/public-api";

export async function GET(request: NextRequest) {
  try {
    return Response.json(
      await listPublicApiKeys(
        await requireActor(),
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return Response.json(
      await createPublicApiKey(await requireActor(), await readBody(request)),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id)
      return Response.json({ error: "API-Key-ID fehlt." }, { status: 400 });
    return Response.json(
      await revokePublicApiKey(
        await requireActor(),
        id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
