import { pageContext } from "@/server/page-context";
import { fieldServiceOptions } from "@/server/field-service";
import {
  WorkOrderEditor,
  ChecklistEditor,
} from "@/components/field-service-controls";
import { canManageWorkOrders } from "@/lib/field-service";
import { notFound } from "next/navigation";
export const metadata = { title: "Einsatz erstellen · Meterwerk" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const context = await pageContext((await searchParams).tenantId);
  if (!canManageWorkOrders(context.actor.role)) notFound();
  const options = await fieldServiceOptions(context.tenantId);
  return (
    <div className="field-service grid gap-6">
      <h1>Einsatz erstellen</h1>
      <p>
        Alle Termine in UTC. Nach dem Erstellen Termin planen und Techniker
        zuweisen.
      </p>
      <WorkOrderEditor tenantId={context.tenantId} options={options} />
      <details>
        <summary>Checklistenvorlage erstellen</summary>
        <ChecklistEditor tenantId={context.tenantId} id="templates" template />
      </details>
    </div>
  );
}
