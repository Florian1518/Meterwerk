import Link from "next/link";
import { requirePageActor } from "@/server/auth";
import { listDevices } from "@/server/device-management";
import { tenantScope } from "@/server/policy";

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePageActor();
  const query = await searchParams;
  const tenantId = tenantScope(actor, query.tenantId);
  const result = await listDevices(query, tenantId);
  return (
    <>
      <h1>Geräteverwaltung</h1>
      <p>
        Zentrale Inventarisierung von Devices, Gateways, Zählern und Profilen.
      </p>
      <form className="panel grid gap-3 md:grid-cols-4" method="get">
        <input name="tenantId" type="hidden" value={tenantId} />
        <label>
          Suche
          <input name="q" defaultValue={query.q} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Alle</option>
            {[
              "NEW",
              "PROVISIONING",
              "ACTIVE",
              "OFFLINE",
              "MAINTENANCE",
              "DECOMMISSIONED",
              "FAILED",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Hersteller
          <input name="manufacturer" defaultValue={query.manufacturer} />
        </label>
        <button type="submit">Filtern</button>
      </form>
      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Seriennummer</th>
              <th>Medium</th>
              <th>Status</th>
              <th>Gateway</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link
                    className="text-link"
                    href={`/devices/${d.id}?tenantId=${tenantId}`}
                  >
                    {d.name ?? d.externalDeviceId}
                  </Link>
                </td>
                <td>{d.serialNumber ?? d.meter.serialNumber}</td>
                <td>{d.meter.type}</td>
                <td>{d.lifecycleStatus}</td>
                <td>{d.gateway?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.items.length === 0 && <p>Keine Geräte gefunden.</p>}
        <p className="mt-3">
          Seite {result.page} von {Math.max(1, result.pages)} · {result.total}{" "}
          Geräte
        </p>
      </div>
    </>
  );
}
