import Link from "next/link";
import { typeLabels, priorityLabels, statusLabels } from "@/lib/field-service";
type Row = {
  id: string;
  number: string;
  title: string;
  type: keyof typeof typeLabels;
  status: keyof typeof statusLabels;
  priority: keyof typeof priorityLabels;
  scheduledAt: Date | null;
  property: { id: string; name: string };
  assignments: { user: { id: string; name: string } }[];
};
export function FieldServiceCalendar({
  rows,
  conflicts,
  tenantId,
  mode,
}: {
  rows: Row[];
  conflicts: { technicianId: string; workOrderIds: string[] }[];
  tenantId: string;
  mode: "day" | "week";
}) {
  return (
    <section className="grid gap-4" aria-label="Disposition Kalender">
      <div className="flex flex-wrap gap-2">
        <Link
          className="rounded border px-3 py-2 underline"
          href={`/work-orders/calendar?tenantId=${encodeURIComponent(tenantId)}&mode=day`}
        >
          Tag
        </Link>
        <Link
          className="rounded border px-3 py-2 underline"
          href={`/work-orders/calendar?tenantId=${encodeURIComponent(tenantId)}&mode=week`}
        >
          Woche
        </Link>
      </div>
      <p>Ansicht: {mode === "day" ? "Tag" : "Woche"}. Alle Zeitangaben UTC.</p>
      {conflicts.length > 0 && (
        <p role="alert" className="rounded border border-amber-500 p-3">
          Konflikthinweis: {conflicts.length} Überschneidung(en) bei
          Technikerzuordnungen.
        </p>
      )}{" "}
      {!rows.length ? (
        <p role="status" className="rounded border p-5">
          Keine geplanten Einsätze im Zeitraum.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border p-4">
              <p className="text-xs">{row.number}</p>
              <h2>
                <Link
                  className="underline"
                  href={`/work-orders/${row.id}?tenantId=${encodeURIComponent(tenantId)}`}
                >
                  {row.title}
                </Link>
              </h2>
              <p>
                {row.scheduledAt?.toISOString().slice(0, 16).replace("T", " ")}{" "}
                UTC
              </p>
              <p>
                {row.property.name} · {typeLabels[row.type]} ·{" "}
                {priorityLabels[row.priority]}
              </p>
              <p>{statusLabels[row.status]}</p>
              <p>
                Techniker:{" "}
                {row.assignments.map((a) => a.user.name).join(", ") ||
                  "nicht zugewiesen"}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
