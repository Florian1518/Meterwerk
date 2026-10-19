import Link from "next/link";
import {
  requireGatewayAdminPage,
  listAdminDevices,
  gatewayAdminTenants,
} from "@/server/gateway-admin";
import {
  GatewayAdminTabs,
  AdminPagination,
} from "@/components/gateway-admin-navigation";
import {
  lifecycleLabels,
  meterLabels,
  technicalLabels,
  utcTime,
} from "@/lib/gateway-admin";
export const metadata = { title: "Geräte · Gateways & Geräte · Meterwerk" };
export default async function AdminDevicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireGatewayAdminPage();
  const query = await searchParams;
  const [result, tenants] = await Promise.all([
    listAdminDevices(query),
    gatewayAdminTenants(),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PLATTFORM · INTERNE VERWALTUNG</div>
          <h1>Gateways &amp; Geräte</h1>
          <p>Zentrale Geräteübersicht über alle Kunden.</p>
        </div>
      </div>
      <GatewayAdminTabs devices />
      <form className="panel grid gap-3 md:grid-cols-4" method="get">
        <label>
          Suche
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Name, ID, Seriennummer"
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
              <th>Gerät</th>
              <th>Kunde</th>
              <th>Gateway</th>
              <th>Zähler</th>
              <th>Profil</th>
              <th>Lifecycle</th>
              <th>Technischer Status</th>
              <th>Letzter Kontakt (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link
                    className="text-link"
                    href={`/devices/${encodeURIComponent(d.id)}?tenantId=${encodeURIComponent(d.tenantId)}&platformAdmin=1`}
                  >
                    {d.name ?? d.externalDeviceId}
                  </Link>
                  <small className="block">{d.id}</small>
                </td>
                <td>{d.tenant.name}</td>
                <td>
                  {d.gateway ? (
                    <Link
                      className="text-link"
                      href={`/platform-admin/gateways/${encodeURIComponent(d.gateway.id)}?tenantId=${encodeURIComponent(d.tenantId)}`}
                    >
                      {d.gateway.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {d.meter.serialNumber} ·{" "}
                  {meterLabels[d.meter.type] ?? d.meter.type}
                </td>
                <td>
                  {d.profile
                    ? `${d.profile.manufacturer} ${d.profile.model} v${d.profile.version}`
                    : "—"}
                </td>
                <td>{lifecycleLabels[d.lifecycleStatus] ?? "Unbekannt"}</td>
                <td>{technicalLabels[d.status] ?? "Unbekannt"}</td>
                <td>{utcTime(d.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.items.length === 0 && <p>Keine Geräte gefunden.</p>}
        <AdminPagination
          page={result.page}
          pages={result.pages}
          total={result.total}
          path="/platform-admin/gateways/devices"
          query={query}
        />
      </div>
    </>
  );
}
