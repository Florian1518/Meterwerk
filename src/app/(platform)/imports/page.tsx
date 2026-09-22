import { redirect } from "next/navigation";
import { pageContext } from "@/server/page-context";
import { TenantSelect } from "@/components/tenant-select";
import { DataImport } from "@/components/data-import";

export const metadata = { title: "Datenimport · Meterwerk" };

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { tenantId } = await searchParams;
  const context = await pageContext(tenantId);
  if (!["SUPER_ADMIN", "TENANT_ADMIN"].includes(context.actor.role))
    redirect("/dashboard");
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
      <DataImport tenantId={context.tenantId} />
    </>
  );
}
