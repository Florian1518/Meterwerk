import { redirect } from "next/navigation";
import { TenantSelect } from "@/components/tenant-select";
import { DataQuality } from "@/components/data-quality";
import { getDataQuality, type DataQualityFilter } from "@/server/data-quality";
import { pageContext } from "@/server/page-context";

export const metadata = { title: "Datenqualität · Meterwerk" };

export default async function DataQualityPage({
  searchParams,
}: {
  searchParams: Promise<DataQualityFilter & { tenantId?: string }>;
}) {
  const params = await searchParams;
  const context = await pageContext(params.tenantId);
  if (!["SUPER_ADMIN", "TENANT_ADMIN"].includes(context.actor.role))
    redirect("/dashboard");
  const data = await getDataQuality(context.actor, context.tenantId, params);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DATENVERWALTUNG</div>
          <h1>Datenqualität</h1>
          <p>
            Prüfen Sie Messreihen und dokumentieren Sie jede Korrektur mit
            vollständiger Historie.
          </p>
        </div>
      </div>
      {context.actor.role === "SUPER_ADMIN" && (
        <TenantSelect tenants={context.tenants} tenantId={context.tenantId} />
      )}
      <DataQuality
        key={`${context.tenantId}:${params.cursor ?? ""}`}
        tenantId={context.tenantId}
        initial={data}
      />
    </>
  );
}
