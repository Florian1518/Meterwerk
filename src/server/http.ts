import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publicError } from "./errors";
import { AccessError } from "./policy";
import { metric } from "./observability";
export function failure(error: unknown) {
  const result = publicError(error);
  metric("http.errors", { status: String(result.status) });
  const requestId = randomUUID();
  return NextResponse.json(
    { error: result.message },
    {
      status: result.status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Correlation-ID": requestId,
      },
    },
  );
}
export async function readBody(request: NextRequest) {
  assertOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AccessError(415, "JSON-Anfrage erforderlich.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Anfrage fehlt.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw new AccessError(413, "Anfrage zu groÃŸ.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}

export function assertOrigin(request: NextRequest) {
  if (
    !process.env.APP_URL ||
    request.headers.get("origin") !== new URL(process.env.APP_URL).origin
  )
    throw new AccessError(403, "Ungültiger Ursprung.");
}
