import { requirePageActor } from "@/server/auth";
import { listIncidents } from "@/server/incident-operations";
import { IncidentForm } from "@/components/incident-form";
export default async function IncidentsPage() {
  await requirePageActor();
  const rows = await listIncidents();
  return (
    <>
      <h1>Incidents</h1>
      <IncidentForm />
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Titel</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Scope</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>{i.title}</td>
                <td>{i.severity}</td>
                <td>{i.status}</td>
                <td>{i.scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p>Keine Incidents.</p>}
      </div>
    </>
  );
}
