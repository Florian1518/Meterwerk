import { redirect } from "next/navigation";
import { pageContext } from "@/server/page-context";
import { TenantSelect } from "@/components/tenant-select";
import { Webhooks } from "@/components/webhooks";
import { IntegrationDiagnostics } from "@/components/integration-diagnostics";
import { listPublicApiKeys } from "@/server/public-api";
import { listWebhooks } from "@/server/webhooks";

export const metadata = { title: "Webhooks · Meterwerk" };

export default async function WebhooksPage({
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
  if (context.actor.role === "SUPER_ADMIN") {
    const [keys, webhooks] = await Promise.all([
      listPublicApiKeys(context.actor, context.tenantId),
      listWebhooks(context.actor, context.tenantId),
    ]);
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">PLATTFORMDIAGNOSE</div>
            <h1>Integrationen</h1>
            <p>
              Tenantbezogene API- und Webhook-Diagnose für {context.tenant.name}
              ; keine Secrets.
            </p>
          </div>
        </div>
        <TenantSelect tenants={context.tenants} tenantId={context.tenantId} />
        <IntegrationDiagnostics
          keys={keys}
          endpoints={webhooks.endpoints}
          deliveries={webhooks.deliveries}
        />
      </>
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INTEGRATIONEN</div>
          <h1>Webhooks</h1>
          <p> Ereignisse aus {context.tenant.name} sicher zustellen.</p>
        </div>
      </div>
      <Webhooks tenantId={context.tenantId} />
    </>
  );
}
