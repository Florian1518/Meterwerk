import { NextRequest } from "next/server";
import {
  authenticatePublicApiKey,
  publicCorrelationId,
  readPublicResource,
} from "@/server/public-api";
import { publicApiFailure, publicApiJson } from "@/server/public-api-http";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ resource: string }> },
) {
  const correlationId = publicCorrelationId(
    request.headers.get("x-correlation-id"),
  );
  try {
    const credential = await authenticatePublicApiKey(
      request.headers.get("authorization"),
    );
    const { resource } = await context.params;
    const result = await readPublicResource(
      credential,
      resource,
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    return publicApiJson(result, correlationId);
  } catch (error) {
    return publicApiFailure(error, correlationId);
  }
}
