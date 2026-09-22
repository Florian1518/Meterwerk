import "server-only";
import { NextResponse } from "next/server";
import { publicError } from "./errors";
import { PublicApiRateLimitError } from "./public-api";

export function publicApiJson(
  body: unknown,
  correlationId: string,
  status = 200,
) {
  return NextResponse.json(
    { ...(body as object), correlationId },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Correlation-ID": correlationId,
        "X-RateLimit-Limit": "120",
      },
    },
  );
}

export function publicApiFailure(error: unknown, correlationId: string) {
  const result = publicError(error);
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store",
    "X-Correlation-ID": correlationId,
    "X-RateLimit-Limit": "120",
  };
  if (error instanceof PublicApiRateLimitError)
    headers["Retry-After"] = String(error.retryAfterSeconds);
  return NextResponse.json(
    { error: result.message, correlationId },
    { status: result.status, headers },
  );
}
