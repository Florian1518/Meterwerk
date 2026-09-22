import { NextRequest } from "next/server";
import { assertOrigin, failure } from "@/server/http";
import { requireActor } from "@/server/auth";
import { previewCsvImport } from "@/server/data-imports";

export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    const form = await request.formData();
    const file = form.get("file");
    const resource = form.get("resource");
    const tenantId = form.get("tenantId");
    let mapping: unknown;
    try {
      mapping = JSON.parse(String(form.get("mapping") ?? "{}"));
    } catch {
      return Response.json(
        { error: "Spaltenzuordnung ist ungültig." },
        { status: 400 },
      );
    }
    return Response.json(
      await previewCsvImport(
        await requireActor(),
        file instanceof File ? file : (null as unknown as File),
        tenantId ? String(tenantId) : null,
        String(resource ?? ""),
        mapping,
      ),
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
