import { requirePageActor } from "@/server/auth";
import { systemStatus } from "@/server/system-status";
import { operationsMetrics, listIncidents } from "@/server/incident-operations";
export default async function OperationsPage() {
  await requirePageActor();
  const h = await systemStatus();
  const metrics = await operationsMetrics();
  const incidents = await listIncidents();
  return (
    <>
      <h1>Operations / System Health</h1>
      <p>
        Status:{" "}
        <strong>{h.postgres && h.ingestion ? "HEALTHY" : "DEGRADED"}</strong>
      </p>
      <section className="panel">
        <p>Gateways: {h.gateways.length}</p>
        <p>Devices: {h.devices.length}</p>
        <p>Worker: {h.worker ? "aktiv" : "inaktiv"}</p>
      </section>
      <section className="panel">
        <h2>Incidents</h2>
        {incidents.slice(0, 10).map((i) => (
          <p key={i.id}>
            {i.severity} · {i.title} · {i.status}
          </p>
        ))}
        {!incidents.length && <p>Keine Incidents.</p>}
      </section>
      <section className="panel">
        <h2>Metriken und Backlogs</h2>
        <p>
          Offene Incidents: {metrics.openIncidents} · Supportfälle:{" "}
          {metrics.openSupportCases}
        </p>
        <p>Zeitfenster: 15 Minuten · 1 Stunde · 24 Stunden · 7 Tage</p>
      </section>
    </>
  );
}
