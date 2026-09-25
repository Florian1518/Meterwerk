import { downloadDisposition } from "@/lib/report-security";
import { NextRequest } from "next/server";
import { failure } from "@/server/http";
import { reportExport } from "@/server/customer-portal";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const format =
      request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
    const out = await reportExport(
      id,
      format,
      request.nextUrl.searchParams.get("tenantId"),
    );
    return new Response(out.body, {
      headers: {
        "Content-Type": out.contentType,
        "Content-Disposition": downloadDisposition(out.fileName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
