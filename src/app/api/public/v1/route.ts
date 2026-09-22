import { NextRequest } from "next/server";
import {
  authenticatePublicApiKey,
  publicApiScopes,
  publicCorrelationId,
} from "@/server/public-api";
import { publicApiFailure, publicApiJson } from "@/server/public-api-http";

export async function GET(request: NextRequest) {
  const correlationId = publicCorrelationId(
    request.headers.get("x-correlation-id"),
  );
  try {
    const key = await authenticatePublicApiKey(
      request.headers.get("authorization"),
    );
    return publicApiJson(
      {
        apiVersion: "v1",
        resources: publicApiScopes
          .filter((scope) => key.scopes.includes(scope))
          .map((scope) => scope.split(":")[0]),
      },
      correlationId,
    );
  } catch (error) {
    return publicApiFailure(error, correlationId);
  }
}
