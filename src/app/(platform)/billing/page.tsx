import { redirect } from "next/navigation";
import { pageContext } from "@/server/page-context";
import { TenantSelect } from "@/components/tenant-select";
import { TenantBillingSummary } from "@/components/tenant-billing-summary";

export const metadata = { title: "SaaS-Plan und Nutzung · Meterwerk" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { tenantId } = await searchParams;
  const context = await pageContext(tenantId);
  if (
    context.actor.role !== "SUPER_ADMIN" &&
    context.actor.role !== "TENANT_ADMIN"
  )
    redirect("/dashboard");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SAAS-ABONNEMENT</div>
          <h1>Plan und Nutzung</h1>
          <p>{context.tenant.name}</p>
        </div>
      </div>
      {context.actor.role === "SUPER_ADMIN" && (
        <TenantSelect tenants={context.tenants} tenantId={context.tenantId} />
      )}
      <TenantBillingSummary tenantId={context.tenantId} />
    </>
  );
}
