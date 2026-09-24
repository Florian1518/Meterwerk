import Link from "next/link";
import { requirePageActor } from "@/server/auth";
import { fleetOverview } from "@/server/device-fleet";
import { tenantScope } from "@/server/policy";
export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePageActor();
  const q = await searchParams;
  const tenantId = tenantScope(actor, q.tenantId);
  const result = await fleetOverview(q, tenantId);
  return (
    <>
      <h1>Fleet Health</h1>
      <p>Regelbasierte Gerätegesundheit und Flottenzustand.</p>
      <section className="grid gap-3 md:grid-cols-5">
        {["ONLINE", "OFFLINE", "WARNING", "MAINTENANCE", "DISABLED"].map(
          (key) => (
            <article className="panel" key={key}>
              <strong>{key}</strong>
              <p>{result.counts[key] ?? 0}</p>
            </article>
          ),
        )}
      </section>
      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Device</th>
              <th>Status</th>
              <th>Health</th>
              <th>Grund</th>
              <th>Firmware</th>
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
                <td>{d.status}</td>
                <td>{d.health.status}</td>
                <td>{d.health.reasons.join(", ")}</td>
                <td>{d.firmwareVersion ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!result.items.length && <p>Keine Geräte gefunden.</p>}
        <p>
          Seite {result.page} von {Math.max(1, result.pages)} · {result.total}{" "}
          Geräte
        </p>
      </div>
    </>
  );
}
