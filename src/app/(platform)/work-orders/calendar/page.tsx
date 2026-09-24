import { pageContext } from "@/server/page-context";
import { calendarWorkOrders } from "@/server/field-service-planning";
import { fieldServiceOptions } from "@/server/field-service";
import { FieldServiceCalendar } from "@/components/field-service-calendar";
import { canManageWorkOrders } from "@/lib/field-service";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    tenantId?: string;
    mode?: string;
    date?: string;
    technicianId?: string;
    status?: string;
    priority?: string;
    propertyId?: string;
  }>;
}) {
  const query = await searchParams;
  const context = await pageContext(query.tenantId);
  const start = new Date(
    query.date
      ? `${query.date}T00:00:00Z`
      : `${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (query.mode === "week" ? 7 : 1));
  const [result, options] = await Promise.all([
    calendarWorkOrders(
      {
        from: start.toISOString(),
        to: end.toISOString(),
        technicianId: query.technicianId || null,
        status: query.status || undefined,
        priority: query.priority || undefined,
        propertyId: query.propertyId || null,
      },
      context.tenantId,
    ),
    canManageWorkOrders(context.actor.role)
      ? fieldServiceOptions(context.tenantId)
      : Promise.resolve({
          properties: [],
          users: [],
          templates: [],
          gateways: [],
        }),
  ]);
  const mode = query.mode === "week" ? "week" : "day";
  return (
    <div className="grid gap-6">
      <header>
        <p className="eyebrow">DISPOSITION</p>
        <h1>Einsatzkalender</h1>
        <p>Geplante Einsätze, Technikerzuordnung und Konflikthinweise.</p>
      </header>
      <form className="grid gap-3 rounded border p-4 md:grid-cols-4">
        <label>
          Techniker
          <select name="technicianId" defaultValue={query.technicianId ?? ""}>
            <option value="">Alle Techniker</option>
            {options.users
              .filter((user) => user.role === "USER")
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Alle Status</option>
            {[
              "PLANNED",
              "ASSIGNED",
              "IN_PROGRESS",
              "PAUSED",
              "COMPLETED",
              "CANCELED",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Priorität
          <select name="priority" defaultValue={query.priority ?? ""}>
            <option value="">Alle Prioritäten</option>
            {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Liegenschaft
          <select name="propertyId" defaultValue={query.propertyId ?? ""}>
            <option value="">Alle Liegenschaften</option>
            {options.properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="tenantId" value={context.tenantId} />
        <input type="hidden" name="mode" value={mode} />
        <button className="min-h-11 rounded border px-3 py-2" type="submit">
          Filter anwenden
        </button>
      </form>
      <FieldServiceCalendar
        rows={result.rows}
        conflicts={result.conflicts}
        tenantId={context.tenantId}
        mode={mode}
      />
    </div>
  );
}
