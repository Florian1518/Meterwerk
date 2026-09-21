import { requirePageActor } from "@/server/auth";
import { platformOverview, listPlatformTenants } from "@/server/platform-admin";
export default async function PlatformAdminPage() {
  const actor = await requirePageActor();
  const [overview, tenants] = await Promise.all([
    platformOverview(actor),
    listPlatformTenants(actor),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PLATTFORM</div>
          <h1>Plattformverwaltung</h1>
          <p>Technischer Überblick ohne Kundenmesswerte.</p>
        </div>
      </div>
      <section className="metric-grid">
        {Object.entries(overview.counts).map(([key, value]) => (
          <div className="metric-card" key={key}>
            <span>{key}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Mandanten-Support</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Mandant</th>
              <th>Benutzer</th>
              <th>Liegenschaften</th>
              <th>Gateways</th>
              <th>Devices</th>
              <th>Alarme</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td>{tenant.name}</td>
                <td>{tenant._count.users}</td>
                <td>{tenant._count.properties}</td>
                <td>{tenant._count.gateways}</td>
                <td>{tenant._count.devices}</td>
                <td>{tenant._count.technicalAlerts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
