"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
const features = [
  "REPORTING",
  "ANALYTICS",
  "API",
  "WEBHOOKS",
  "ADVANCED_EXPORTS",
] as const;
type Plan = {
  code: string;
  name: string;
  maxProperties: number;
  maxMeters: number;
  maxUsers: number;
  maxGateways: number;
  maxBuildings: number;
  maxUnits: number;
  maxDevices: number;
  features: { feature: string; enabled: boolean }[];
};
type Subscription = {
  status: string;
  startsAt: string;
  endsAt: string | null;
  trialEndsAt: string | null;
  billingInterval: "MONTHLY" | "YEARLY";
  priceAmount: string | null;
  priceCurrency: string | null;
  billingContactName: string | null;
  billingContactEmail: string | null;
  billingContactCompany: string | null;
  billingContactAddress: string | null;
  externalBillingId: string | null;
  plan: Plan;
  tenant: {
    featureOverrides: { feature: string; enabled: boolean }[];
    planOverride: {
      maxProperties: number | null;
      maxMeters: number | null;
      maxUsers: number | null;
      maxGateways: number | null;
      maxBuildings: number | null;
      maxUnits: number | null;
      maxDevices: number | null;
    } | null;
  };
} | null;
type Usage = {
  plan: { name: string };
  month: string;
  reports: number;
  apiRequests: number;
  exports: number;
  resources: {
    key: string;
    label: string;
    count: number;
    limit: number | null;
    percent: number | null;
    warning: number | null;
  }[];
};
export function LicensingPanel({
  tenants,
}: {
  tenants: { id: string; name: string }[];
}) {
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const loadVersion = useRef(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [billing, setBilling] = useState<Record<string, string>>({});
  const load = useCallback(
    async (id = tenantId) => {
      const version = ++loadVersion.current;
      const [planResponse, subscriptionResponse, usageResponse] =
        await Promise.all([
          fetch("/api/platform/licensing", { cache: "no-store" }),
          fetch(`/api/platform/licensing?tenantId=${encodeURIComponent(id)}`, {
            cache: "no-store",
          }),
          fetch(
            `/api/platform/licensing?usage=true&tenantId=${encodeURIComponent(id)}`,
            { cache: "no-store" },
          ),
        ]);
      if (!planResponse.ok || !subscriptionResponse.ok || !usageResponse.ok)
        throw new Error("Lizenzdaten konnten nicht geladen werden.");
      const [availablePlans, current, currentUsage] = (await Promise.all([
        planResponse.json(),
        subscriptionResponse.json(),
        usageResponse.json(),
      ])) as [Plan[], Subscription, Usage];
      if (version !== loadVersion.current) return;
      setPlans(availablePlans);
      setSubscription(current);
      setUsage(currentUsage);
      setBilling({
        billingInterval: current?.billingInterval ?? "MONTHLY",
        priceAmount: current?.priceAmount ?? "",
        priceCurrency: current?.priceCurrency ?? "EUR",
        billingContactName: current?.billingContactName ?? "",
        billingContactEmail: current?.billingContactEmail ?? "",
        billingContactCompany: current?.billingContactCompany ?? "",
        billingContactAddress: current?.billingContactAddress ?? "",
        externalBillingId: current?.externalBillingId ?? "",
      });
      setLimits(
        Object.fromEntries(
          [
            "maxProperties",
            "maxBuildings",
            "maxUnits",
            "maxMeters",
            "maxDevices",
            "maxUsers",
            "maxGateways",
          ].map((key) => [
            key,
            String(
              current?.tenant.planOverride?.[
                key as keyof NonNullable<Subscription>["tenant"]["planOverride"]
              ] ?? "",
            ),
          ]),
        ),
      );
    },
    [tenantId],
  );
  useEffect(() => {
    if (!tenantId) return;
    const timer = setTimeout(() => {
      void load().catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Laden fehlgeschlagen.",
        ),
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [load, tenantId]);
  async function post(body: Record<string, unknown>) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/licensing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Speichern fehlgeschlagen.");
      await load();
      setMessage("Lizenzänderung gespeichert.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      setPending(false);
    }
  }
  if (!tenants.length)
    return (
      <section className="panel">
        <h2>Keine Mandanten</h2>
        <p>Für Lizenzverwaltung ist ein Mandant erforderlich.</p>
      </section>
    );
  const enabled = new Map(
    (subscription?.plan.features ?? []).map((row) => [
      row.feature,
      row.enabled,
    ]),
  );
  for (const row of subscription?.plan.code === "ENTERPRISE"
    ? subscription.tenant.featureOverrides
    : [])
    enabled.set(row.feature, row.enabled);
  return (
    <section className="panel licensing-panel">
      <h2>SaaS-Plan und Entitlements</h2>
      <p>
        Planlimits und Features werden bei jedem fachlichen Serverzugriff
        geprüft.
      </p>
      {message && (
        <p role="status" className="toast">
          {message}
        </p>
      )}
      <div className="form-grid">
        <label>
          Mandant
          <select
            value={tenantId}
            disabled={pending}
            onChange={(event) => {
              loadVersion.current++;
              setSubscription(null);
              setUsage(null);
              setTenantId(event.target.value);
            }}
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plan
          <select
            value={subscription?.plan.code ?? ""}
            disabled={pending}
            onChange={(event) =>
              void post({
                operation: "plan",
                tenantId,
                plan: event.target.value,
              })
            }
          >
            {plans.map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {subscription && (
        <>
          {usage && (
            <section aria-label="Nutzung und Limits">
              <h3>Nutzung – {usage.plan.name}</h3>
              <p>
                Bestandsdaten bleiben auch nach einem Downgrade verfügbar.
                Erreichte Limits begrenzen ausschließlich neue Einträge.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <caption>
                    Aktueller Bestand und wirksame Limits einschließlich
                    Enterprise-Overrides
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Ressource</th>
                      <th scope="col">Nutzung</th>
                      <th scope="col">Limit</th>
                      <th scope="col">Auslastung</th>
                      <th scope="col">Hinweis</th>
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
                            : `${row.percent.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`}
                        </td>
                        <td>
                          {row.warning === 100
                            ? "Limit erreicht: keine neue Anlage"
                            : row.warning
                              ? `Warnung: mindestens ${row.warning} % belegt`
                              : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Reports im Bestand: {usage.reports.toLocaleString("de-DE")}.
                Monat {usage.month} (UTC):{" "}
                {usage.apiRequests.toLocaleString("de-DE")} authentifizierte
                Device-API-Aufrufe, {usage.exports.toLocaleString("de-DE")}{" "}
                erzeugte Exporte. Diese Nutzungszähler haben derzeit kein
                Planlimit und werden seit Einführung der Erfassung gezählt.
              </p>
            </section>
          )}
          <dl className="plan-summary">
            <div>
              <dt>Vertragsstatus</dt>
              <dd>{subscription.status}</dd>
            </div>
            <div>
              <dt>Support</dt>
              <dd>
                {subscription.plan.code === "ENTERPRISE"
                  ? "Dedicated"
                  : subscription.plan.code === "PROFESSIONAL"
                    ? "Priorität"
                    : "Standard"}
              </dd>
            </div>
          </dl>
          <dl className="plan-summary">
            <div>
              <dt>Beginn</dt>
              <dd>
                {new Date(subscription.startsAt).toLocaleDateString("de-DE")}
              </dd>
            </div>
            <div>
              <dt>Ende</dt>
              <dd>
                {subscription.endsAt
                  ? new Date(subscription.endsAt).toLocaleDateString("de-DE")
                  : "Kein Enddatum"}
              </dd>
            </div>
            {subscription.status === "TRIAL" && (
              <div>
                <dt>Testphase bis</dt>
                <dd>
                  {subscription.trialEndsAt
                    ? new Date(subscription.trialEndsAt).toLocaleDateString(
                        "de-DE",
                      )
                    : "Kein Ablaufdatum"}
                </dd>
              </div>
            )}
            <div>
              <dt>Abrechnungsintervall</dt>
              <dd>
                {subscription.billingInterval === "YEARLY"
                  ? "Jährlich"
                  : "Monatlich"}
              </dd>
            </div>
            <div>
              <dt>SaaS-Preis</dt>
              <dd>
                {subscription.priceAmount === null
                  ? "Noch nicht festgelegt"
                  : `${Number(subscription.priceAmount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} ${subscription.priceCurrency ?? ""}`}
              </dd>
            </div>
          </dl>
          <fieldset>
            <legend>Vertragsverwaltung (SUPER_ADMIN)</legend>
            <div className="form-grid">
              <label>
                Status
                <select
                  value={subscription.status}
                  disabled={pending}
                  onChange={(event) =>
                    void post({
                      operation: "status",
                      tenantId,
                      status: event.target.value,
                    })
                  }
                >
                  {["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"].map(
                    (status) => (
                      <option key={status}>{status}</option>
                    ),
                  )}
                </select>
              </label>
              {subscription.status === "TRIAL" && (
                <Button
                  disabled={pending}
                  onClick={() =>
                    void post({ operation: "extendTrial", tenantId, days: 14 })
                  }
                >
                  Testphase um 14 Tage verlängern
                </Button>
              )}
            </div>
            <div className="form-grid">
              {Object.entries({
                billingContactName: "Billing-Kontakt",
                billingContactEmail: "Billing-E-Mail",
                billingContactCompany: "Unternehmen",
                billingContactAddress: "Rechnungsanschrift",
                externalBillingId: "Externe Billing-ID (optional)",
              }).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={billing[key] ?? ""}
                    type={key === "billingContactEmail" ? "email" : "text"}
                    onChange={(event) =>
                      setBilling((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <label>
                Intervall
                <select
                  value={billing.billingInterval ?? "MONTHLY"}
                  onChange={(event) =>
                    setBilling((current) => ({
                      ...current,
                      billingInterval: event.target.value,
                    }))
                  }
                >
                  <option value="MONTHLY">Monatlich</option>
                  <option value="YEARLY">Jährlich</option>
                </select>
              </label>
              <label>
                SaaS-Preis (Dezimalbetrag)
                <input
                  inputMode="decimal"
                  value={billing.priceAmount ?? ""}
                  placeholder="z. B. 49,00"
                  onChange={(event) =>
                    setBilling((current) => ({
                      ...current,
                      priceAmount: event.target.value.replace(",", "."),
                    }))
                  }
                />
              </label>
              <label>
                Währung
                <input
                  maxLength={3}
                  value={billing.priceCurrency ?? "EUR"}
                  onChange={(event) =>
                    setBilling((current) => ({
                      ...current,
                      priceCurrency: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </label>
            </div>
            <Button
              disabled={pending}
              onClick={() =>
                void post({
                  operation: "billingMetadata",
                  tenantId,
                  billingInterval: billing.billingInterval,
                  priceAmount: billing.priceAmount || null,
                  priceCurrency: billing.priceCurrency || null,
                  ...Object.fromEntries(
                    [
                      "billingContactName",
                      "billingContactEmail",
                      "billingContactCompany",
                      "billingContactAddress",
                      "externalBillingId",
                    ].map((key) => [key, billing[key] || null]),
                  ),
                })
              }
            >
              Billing-Metadaten speichern
            </Button>
            <p>
              Diese SaaS-Vertragsdaten lösen keine Rechnungsstellung oder
              Zahlung aus und sind von Energietarifen getrennt.
            </p>
          </fieldset>
          <fieldset>
            <legend>Features</legend>
            <div className="feature-grid">
              {features.map((feature) => (
                <label key={feature}>
                  <input
                    type="checkbox"
                    checked={enabled.get(feature) ?? false}
                    disabled={
                      pending || subscription.plan.code !== "ENTERPRISE"
                    }
                    onChange={(event) =>
                      void post({
                        operation: "featureOverride",
                        tenantId,
                        feature,
                        enabled: event.target.checked,
                      })
                    }
                  />{" "}
                  {feature}
                </label>
              ))}
            </div>
          </fieldset>
          {subscription.plan.code === "ENTERPRISE" && (
            <fieldset>
              <legend>Enterprise-Limit-Overrides</legend>
              <div className="form-grid">
                {Object.entries({
                  maxProperties: "Liegenschaften",
                  maxBuildings: "Gebäude",
                  maxUnits: "Nutzungseinheiten",
                  maxDevices: "Devices",
                  maxMeters: "Zähler",
                  maxUsers: "Benutzer",
                  maxGateways: "Gateways",
                }).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min="0"
                      value={limits[key] ?? ""}
                      placeholder="Planstandard"
                      onChange={(event) =>
                        setLimits((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <Button
                disabled={pending}
                onClick={() =>
                  void post({
                    operation: "limitOverride",
                    tenantId,
                    ...Object.fromEntries(
                      Object.entries(limits).map(([key, value]) => [
                        key,
                        value ? Number(value) : null,
                      ]),
                    ),
                  })
                }
              >
                Limits speichern
              </Button>
            </fieldset>
          )}
        </>
      )}
    </section>
  );
}
