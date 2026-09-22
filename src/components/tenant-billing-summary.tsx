"use client";
import { useEffect, useState } from "react";

type Data = {
  subscription: {
    status: string;
    startsAt: string;
    endsAt: string | null;
    trialEndsAt: string | null;
    billingInterval: string;
    plan: { name: string };
    features: Record<string, boolean>;
  };
  usage: {
    resources: {
      key: string;
      label: string;
      count: number;
      limit: number | null;
      percent: number | null;
      warning: number | null;
    }[];
  };
};

export function TenantBillingSummary({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/billing?tenantId=${encodeURIComponent(tenantId)}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error ?? "Vertragsdaten konnten nicht geladen werden.",
          );
        setData(body);
      })
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Vertragsdaten konnten nicht geladen werden.",
          );
      });
    return () => abort.abort();
  }, [tenantId]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Plan und Nutzung werden geladen …</p>;
  const { subscription, usage } = data;
  return (
    <section className="panel">
      <h2>
        {subscription.plan.name} · {subscription.status}
      </h2>
      <p>
        Beginn: {new Date(subscription.startsAt).toLocaleDateString("de-DE")} ·{" "}
        {subscription.billingInterval === "YEARLY" ? "Jährliche" : "Monatliche"}{" "}
        Abrechnung
      </p>
      {subscription.endsAt && (
        <p>Ende: {new Date(subscription.endsAt).toLocaleDateString("de-DE")}</p>
      )}
      {subscription.status === "TRIAL" && (
        <p>
          Testphase bis{" "}
          {subscription.trialEndsAt
            ? new Date(subscription.trialEndsAt).toLocaleDateString("de-DE")
            : "ohne festes Enddatum"}
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table>
          <caption>Ihre Nutzung und die wirksamen Planlimits</caption>
          <thead>
            <tr>
              <th scope="col">Ressource</th>
              <th scope="col">Nutzung</th>
              <th scope="col">Limit</th>
              <th scope="col">Auslastung</th>
            </tr>
          </thead>
          <tbody>
            {usage.resources.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{row.count.toLocaleString("de-DE")}</td>
                <td>
                  {row.limit === null
                    ? "Unbegrenzt"
                    : row.limit.toLocaleString("de-DE")}
                </td>
                <td>
                  {row.percent === null
                    ? "–"
                    : `${row.percent.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %${row.warning ? ` · Warnung ${row.warning} %` : ""}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Verfügbare Features</h3>
      <ul>
        {Object.entries(subscription.features).map(([feature, enabled]) => (
          <li key={feature}>
            {feature}: {enabled ? "Verfügbar" : "Nicht im Plan enthalten"}
          </li>
        ))}
      </ul>
    </section>
  );
}
