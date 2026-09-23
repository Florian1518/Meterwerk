import { requireActor } from "@/server/auth";
import { listDashboards } from "@/server/dashboards";
import { DashboardBuilder } from "@/components/dashboard-builder";
export default async function DashboardsPage() {
  const actor = await requireActor();
  const rows = await listDashboards(actor, actor.tenantId);
  const row = rows[0];
  return row ? (
    <DashboardBuilder initial={row} tenantId={actor.tenantId ?? ""} />
  ) : (
    <main className="panel">
      <h1>Dashboards</h1>
      <p>Noch kein Dashboard vorhanden.</p>
    </main>
  );
}
