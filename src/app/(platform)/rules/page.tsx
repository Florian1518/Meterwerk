import { redirect } from "next/navigation";
import { pageContext } from "@/server/page-context";
import { listRules } from "@/server/rules";
import { Rules } from "@/components/rules";
import { TenantSelect } from "@/components/tenant-select";

export const metadata = { title: "Regeln · Meterwerk" };
export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { tenantId } = await searchParams;
  const context = await pageContext(tenantId);
  if (!["SUPER_ADMIN", "TENANT_ADMIN"].includes(context.actor.role))
    redirect("/dashboard");
  const rules = await listRules(context.actor, context.tenantId);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">AUTOMATION</div>
          <h1>Regeln</h1>
          <p>
            Strukturierte, tenantgebundene Prüfungen und Aktionen für Messwerte,
            Alarme und Verbindungsstatus.
          </p>
        </div>
      </div>
      {context.actor.role === "SUPER_ADMIN" && (
        <TenantSelect tenants={context.tenants} tenantId={context.tenantId} />
      )}
      <Rules tenantId={context.tenantId} initial={rules} />
    </>
  );
}
