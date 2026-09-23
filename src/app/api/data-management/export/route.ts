import { NextRequest } from "next/server";
import { requireActor } from "@/server/auth";
import { failure } from "@/server/http";
import { exportReadings } from "@/server/data-export";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    const query = request.nextUrl.searchParams;
    const stream = await exportReadings(
      actor,
      query.get("tenantId"),
      Object.fromEntries([...query].filter(([, value]) => value.trim() !== "")),
    );
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="messwerte.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Export-Timezone": "UTC",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
