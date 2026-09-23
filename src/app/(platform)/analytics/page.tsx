import { requireActor } from "@/server/auth";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
export default async function AnalyticsPage() {
  const actor = await requireActor();
  return <AnalyticsDashboard tenantId={actor.tenantId ?? ""} />;
}
