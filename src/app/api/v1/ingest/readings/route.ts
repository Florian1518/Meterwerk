import { NextRequest, NextResponse } from "next/server";
import {
  authenticateDevice,
  consumeDeviceRateLimit,
} from "@/server/device-auth";
import { ingestReading } from "@/server/ingestion";
import { failure } from "@/server/http";
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateDevice(request.headers.get("authorization"));
    await consumeDeviceRateLimit(auth.credential.id);
    if (Number(request.headers.get("content-length") ?? 0) > 16384)
      return NextResponse.json({ error: "Anfrage zu groß." }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 16384)
      return NextResponse.json({ error: "Anfrage zu groß." }, { status: 413 });
    const result = await ingestReading(auth.device, JSON.parse(raw));
    return NextResponse.json(
      { data: result },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
