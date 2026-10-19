import Link from "next/link";
import {
  requireGatewayAdminPage,
  gatewayAdminTenants,
  listAdminGateways,
} from "@/server/gateway-admin";
import {
  GatewayAdminTabs,
  AdminPagination,
} from "@/components/gateway-admin-navigation";
import { PrepareGateway } from "@/components/gateway-admin-controls";
import { credentialLabel, technicalLabels, utcTime } from "@/lib/gateway-admin";
export const metadata = { title: "Gateways & Geräte · Meterwerk" };
export default async function AdminGatewaysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireGatewayAdminPage();
  const query = await searchParams;
  const [result, tenants] = await Promise.all([
    listAdminGateways(query),
    gatewayAdminTenants(),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PLATTFORM · INTERNE VERWALTUNG</div>
          <h1>Gateways &amp; Geräte</h1>
          <p>
            Mandantenübergreifendes Gateway-Inventar und technische Metadaten.
          </p>
        </div>
      </div>
      <GatewayAdminTabs />
      <PrepareGateway tenants={tenants} />
      <form className="panel grid gap-3 md:grid-cols-4" method="get">
        <label>
          Suche
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Name, Gateway-ID oder externe ID"
          />
        </label>
        <label>
          Kunde
          <select name="tenantId" defaultValue={query.tenantId ?? ""}>
            <option value="">Alle Kunden</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Technischer Status
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Alle</option>
            {["ONLINE", "OFFLINE", "WARNING", "MAINTENANCE", "DISABLED"].map(
              (s) => (
                <option key={s} value={s}>
                  {technicalLabels[s] ?? s}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="flex items-end">
          <button className="button-secondary" type="submit">
            Filtern
          </button>
        </div>
      </form>
      <div className="panel table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Gateway-ID / extern</th>
              <th>Kunde</th>
              <th>Liegenschaft</th>
              <th>Technischer Status</th>
              <th>Lifecycle</th>
              <th>Verbindung</th>
              <th>Letzter Kontakt (UTC)</th>
              <th>Software</th>
              <th>Geräte</th>
              <th>Credential</th>
              <th>Technik</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((g) => {
              const properties = Array.from(
                new Map(
                  g.devices.flatMap((d) =>
                    d.meter.unit.building.property
                      ? [
                          [
                            d.meter.unit.building.property.id,
                            d.meter.unit.building.property.name,
                          ] as const,
                        ]
                      : [],
                  ),
                ).values(),
              );
              const active = g.credentials.some(
                (c) => credentialLabel(c) === "Aktiv",
              );
              const credential = active
                ? "Aktiv"
                : g.credentials.length
                  ? "Widerrufen / abgelaufen"
                  : "Kein Credential";
              const warning =
                g.queueWarning || g.queueDropped > 0 || g.quarantineSize > 0;
              const online = g.status === "ONLINE";
              return (
                <tr key={g.id}>
                  <td>
                    <Link
                      className="text-link"
                      href={`/platform-admin/gateways/${encodeURIComponent(g.id)}?tenantId=${encodeURIComponent(g.tenantId)}`}
                    >
                      {g.id}
                    </Link>
                    <small className="block">{g.externalGatewayId}</small>
                  </td>
                  <td>{g.tenant.name}</td>
                  <td>{properties.length ? properties.join(", ") : "—"}</td>
                  <td>{technicalLabels[g.status] ?? "Unbekannt"}</td>
                  <td>—</td>
                  <td>
                    {online
                      ? "Online"
                      : g.status === "OFFLINE"
                        ? "Offline"
                        : "Unbekannt"}
                  </td>
                  <td>{utcTime(g.lastSeenAt)}</td>
                  <td>{g.firmwareVersion ?? "—"}</td>
                  <td>{g._count.devices}</td>
                  <td>{credential}</td>
                  <td>{warning ? "Queue-/Quarantänewarnung" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {result.items.length === 0 && <p>Keine Gateways gefunden.</p>}
        <AdminPagination
          page={result.page}
          pages={result.pages}
          total={result.total}
          path="/platform-admin/gateways"
          query={query}
        />
      </div>
    </>
  );
}
