import { redirect } from "next/navigation";
import { pageContext } from "@/server/page-context";
import { TenantSelect } from "@/components/tenant-select";
import { DataImport } from "@/components/data-import";
import { DataExport } from "@/components/data-export";
import { ImportHistory } from "@/components/import-history";
import { importHistory } from "@/server/data-imports";

export const metadata = { title: "Datenimport · Meterwerk" };

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string; cursor?: string }>;
}) {
  const { tenantId, cursor } = await searchParams;
  const context = await pageContext(tenantId);
  if (!["SUPER_ADMIN", "TENANT_ADMIN"].includes(context.actor.role))
    redirect("/dashboard");
  const history = await importHistory(context.actor, context.tenantId, {
    cursor,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DATENVERWALTUNG</div>
          <h1>CSV-Datenimport</h1>
          <p>
            Stammdaten und historische Messwerte prüfen, zuordnen und
            kontrolliert übernehmen.
          </p>
        </div>
      </div>
      {context.actor.role === "SUPER_ADMIN" && (
        <TenantSelect tenants={context.tenants} tenantId={context.tenantId} />
      )}
      <DataImport key={context.tenantId} tenantId={context.tenantId} />
      <DataExport tenantId={context.tenantId} />
      <ImportHistory
        data={history}
        tenantId={context.tenantId}
        cursor={cursor}
      />
    </>
  );
}
