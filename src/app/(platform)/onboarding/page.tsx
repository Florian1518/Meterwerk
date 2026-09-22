export const metadata = { title: "Onboarding · Meterwerk" };
import Link from "next/link";
import { pageContext } from "@/server/page-context";
import { getOnboardingStatus } from "@/server/onboarding";
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const ctx = await pageContext((await searchParams).tenantId);
  const status = await getOnboardingStatus(ctx.actor, ctx.tenantId);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EINRICHTUNG</div>
          <h1>Kunden-Onboarding</h1>
          <p>
            {status.tenant.name} · {status.completed} von {status.total}{" "}
            Schritten abgeschlossen
          </p>
        </div>
      </div>
      <section className="panel">
        <ol className="status-list">
          {status.steps.map((step) => (
            <li key={step.id}>
              <span
                className={step.complete ? "status-dot ok" : "status-dot"}
              />{" "}
              <div>
                <strong>{step.title}</strong>
                <small>
                  {step.complete
                    ? `${step.count ?? 1} vorhanden`
                    : "Noch offen"}
                </small>
              </div>
              {!step.complete && (
                <Link
                  className="text-link"
                  href={`${step.href}?tenantId=${encodeURIComponent(ctx.tenantId)}`}
                >
                  Öffnen
                </Link>
              )}
            </li>
          ))}
        </ol>
        {status.readyForGoLive && (
          <p className="success">
            Alle Voraussetzungen für Go-Live sind erfüllt. Die Aktivierung
            erfolgt über die geschützte API.
          </p>
        )}
      </section>
    </>
  );
}
