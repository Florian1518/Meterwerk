import "server-only";
import { db } from "./db";
import { requireActor } from "./auth";
import { AccessError, tenantScope } from "./policy";
import { terminal } from "@/lib/field-service";
import { workOrderScope } from "./field-service";
import { pdfText } from "@/lib/report-security";

function pdf(lines: string[]) {
  const safe = lines.map((line) => pdfText(line.slice(0, 180)));
  const stream = `BT /F1 10 Tf 40 800 Td ${safe.map((line, index) => `${index ? "0 -14 Td " : ""}(${line}) Tj`).join(" ")} ET`;
  return `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
}
export async function workOrderReport(
  workOrderId: string,
  requested?: string | null,
) {
  const actor = await requireActor();
  const tenantId = tenantScope(actor, requested);
  const order = await db.workOrder.findFirst({
    where: { ...workOrderScope(actor, tenantId), id: workOrderId },
    include: {
      property: { select: { name: true, address: true, city: true } },
      assignments: { include: { user: { select: { name: true } } } },
      checklists: { include: { items: { orderBy: { order: "asc" } } } },
      entries: {
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      replacement: {
        include: {
          oldMeter: {
            select: { serialNumber: true, type: true, measurementUnit: true },
          },
          newMeter: { select: { serialNumber: true } },
        },
      },
      attachments: { select: { fileName: true, category: true, id: true } },
      addenda: { select: { title: true, status: true } },
    },
  });
  if (!order) throw new AccessError(404, "Einsatz nicht gefunden.");
  if (!terminal(order.status))
    throw new AccessError(
      409,
      "Einsatzbericht ist erst nach Abschluss verfügbar.",
    );
  const doc = order.documentation as {
    report?: string;
    workPerformed?: string;
    defects?: string;
    recommendations?: string;
    actualStart?: string;
    actualEnd?: string;
  } | null;
  const lines = [
    `Einsatzbericht ${order.number}`,
    `Status: ${order.status}`,
    `Liegenschaft: ${order.property.name}, ${order.property.address}, ${order.property.city}`,
    `Termin: ${order.scheduledAt?.toISOString() ?? "-"}`,
    `Techniker: ${order.assignments.map((a) => a.user.name).join(", ") || "-"}`,
    `Arbeitsbericht: ${doc?.report ?? "-"}`,
    `Ausgeführte Arbeiten: ${doc?.workPerformed ?? "-"}`,
    `Mängel: ${doc?.defects ?? "-"}`,
    `Empfehlungen: ${doc?.recommendations ?? "-"}`,
    `Einsatzzeit: ${doc?.actualStart ?? "-"} bis ${doc?.actualEnd ?? "-"}`,
  ];
  for (const list of order.checklists) {
    lines.push(`Checkliste: ${list.title}`);
    for (const item of list.items)
      lines.push(`- ${item.completed ? "Erledigt" : "Offen"}: ${item.title}`);
  }
  for (const entry of order.entries) {
    const payload = entry.payload as Record<string, unknown>;
    lines.push(
      `${entry.kind}: ${String(payload.description ?? payload.activity ?? payload.name ?? "")} (${entry.actor.name})`,
    );
  }
  if (order.replacement)
    lines.push(
      `Zählerwechsel: ${order.replacement.oldMeter.serialNumber} -> ${order.replacement.newMeter.serialNumber} (${order.replacement.oldMeter.type}, ${order.replacement.oldMeter.measurementUnit})`,
    );
  for (const attachment of order.attachments)
    lines.push(
      `Anhang: ${attachment.fileName} [${attachment.category}] /api/attachments/${attachment.id}`,
    );
  for (const addendum of order.addenda)
    lines.push(`Nachtrag: ${addendum.title} (${addendum.status})`);
  return {
    body: pdf(lines),
    contentType: "application/pdf",
    fileName: `${order.number}-einsatzbericht.pdf`,
  };
}
