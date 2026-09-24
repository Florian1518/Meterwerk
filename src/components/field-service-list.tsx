import Link from "next/link";
import { pageContext } from "@/server/page-context";
import { listWorkOrders } from "@/server/field-service";
import {
  canManageWorkOrders,
  priorityLabels,
  statusLabels,
  typeLabels,
} from "@/lib/field-service";
import { TenantSelect } from "./tenant-select";
import { Button } from "./ui/button";

export async function FieldServiceList({
  tenantId,
  view,
  technician = false,
}: {
  tenantId?: string;
  view?: string;
  technician?: boolean;
}) {
  const context = await pageContext(tenantId);
  const selected = technician
    ? view && ["mine", "today", "planned", "active", "completed"].includes(view)
      ? view
      : "mine"
    : "all";
  const rows = await listWorkOrders(context.tenantId, { view: selected });
  const query = `tenantId=${encodeURIComponent(context.tenantId)}`;
  return (
    <div className="grid gap-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow">FIELD SERVICE</div>
          <h1>{technician ? "Meine Einsätze" : "Einsatzverwaltung"}</h1>
          <p>
            Termine und Zeitangaben in UTC. Für Daten und Änderungen ist eine
            Online-Verbindung erforderlich.
          </p>
        </div>
      </div>
      {context.actor.role === "SUPER_ADMIN" && (
        <TenantSelect tenants={context.tenants} tenantId={context.tenantId} />
      )}
      <nav aria-label="Einsatzansichten" className="flex flex-wrap gap-3">
        {canManageWorkOrders(context.actor.role) && (
          <>
            <Button asChild>
              <Link href={`/work-orders/new?${query}`}>Einsatz erstellen</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/work-orders?${query}`}>Alle Einsätze</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/work-orders/calendar?${query}&mode=week`}>
                Kalender
              </Link>
            </Button>
          </>
        )}
        {[
          ["mine", "Meine Einsätze"],
          ["today", "Heute (UTC)"],
          ["planned", "Geplant"],
          ["active", "In Bearbeitung"],
          ["completed", "Abgeschlossen"],
        ].map(([key, label]) => (
          <Button asChild variant="outline" key={key}>
            <Link
              aria-current={selected === key ? "page" : undefined}
              href={`/technician?${query}&view=${key}`}
            >
              {label}
            </Link>
          </Button>
        ))}
      </nav>
      {technician && selected === "today" && (
        <p>
          Zeitraum: {new Date().toISOString().slice(0, 10)}, 00:00 bis 24:00
          UTC.
        </p>
      )}
      {!rows.length ? (
        <p role="status" className="rounded-xl border p-6">
          Keine Einsätze in dieser Ansicht vorhanden oder freigegeben.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="min-w-0 rounded-xl border bg-[var(--surface)] p-5"
            >
              <p className="break-all text-xs">{row.number}</p>
              <h2 className="my-2 text-lg font-semibold">
                <Link
                  className="underline"
                  href={`/work-orders/${row.id}?${query}`}
                >
                  {row.title}
                </Link>
              </h2>
              <p>{row.property.name}</p>
              <p>
                {typeLabels[row.type]} · {priorityLabels[row.priority]}
              </p>
              <p className="font-semibold">{statusLabels[row.status]}</p>
              <p>
                {row.scheduledAt
                  ? `${row.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
                  : "Noch kein Termin"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
