import { NextRequest, NextResponse } from "next/server";
import {
  authenticateDevice,
  consumeDeviceRateLimit,
} from "@/server/device-auth";
import { ingestReading } from "@/server/ingestion";
import { failure } from "@/server/http";
import { ingestUtility } from "@/server/utility-ingestion";
export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 16384)
      return NextResponse.json({ error: "Anfrage zu groß." }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 16384)
      return NextResponse.json({ error: "Anfrage zu groß." }, { status: 413 });
    const payload: unknown = JSON.parse(raw);
    let result;
    if (payload && typeof payload === "object" && "measurements" in payload) {
      result = await ingestUtility(
        request.headers.get("authorization"),
        payload,
        request.headers.get("x-correlation-id") ?? undefined,
      );
    } else {
      const auth = await authenticateDevice(
        request.headers.get("authorization"),
      );
      await consumeDeviceRateLimit(auth.credential.id);
      result = await ingestReading(auth.device, payload);
    }
    return NextResponse.json(
      { data: result },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
