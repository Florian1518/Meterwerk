import { NextRequest } from "next/server";
import { exportModbusCsv } from "@/server/modbus";
import { failure } from "@/server/http";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const q = request.nextUrl.searchParams;
    const csv = await exportModbusCsv(
      (await params).id,
      { from: q.get("from"), to: q.get("to"), metric: q.get("metric") },
      q.get("tenantId"),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=meterwerk-readings.csv",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
