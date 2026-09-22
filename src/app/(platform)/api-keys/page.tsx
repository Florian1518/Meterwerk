import { redirect } from "next/navigation";
import { pageContext } from "@/server/page-context";
import { TenantSelect } from "@/components/tenant-select";
import { PublicApiKeys } from "@/components/public-api-keys";
import { IntegrationDiagnostics } from "@/components/integration-diagnostics";
import { listPublicApiKeys } from "@/server/public-api";
import { listWebhooks } from "@/server/webhooks";

export const metadata = { title: "Public API-Keys · Meterwerk" };

export default async function ApiKeysPage({
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
          <h1>Public API-Keys</h1>
          <p>Keys gelten ausschließlich für {context.tenant.name}.</p>
        </div>
      </div>
      <PublicApiKeys tenantId={context.tenantId} />
      <section className="panel">
        <h2>API v1</h2>
        <p>
          Basis: <code>/api/public/v1/</code>. Dokumentation:{" "}
          <code>docs/PUBLIC-API.md</code>. Jeder Aufruf benötigt einen
          tenant-gebundenen Bearer-Key.
        </p>
      </section>
    </>
  );
}
