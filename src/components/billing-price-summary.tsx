export type BillingPriceData = {
  pricingMode: "FIXED" | "BASE_PLUS_METER";
  priceAmount: string | null;
  basePriceAmount: string | null;
  pricePerMeterAmount: string | null;
  priceCurrency: string | null;
  effectivePriceAmount: string | null;
  meterCostAmount: string | null;
  billableMeterCount: number;
  billingInterval: string;
};

// Format the server's decimal strings without converting money to binary floats.
function money(value: string | null, currency: string | null) {
  if (value === null) return "Noch nicht festgelegt";
  const [whole, fraction = ""] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction.padEnd(2, "0")} ${currency === "EUR" ? "€" : (currency ?? "")}`;
}

export function BillingPriceSummary({ data }: { data: BillingPriceData }) {
  const format = (value: string | null) => money(value, data.priceCurrency);
  return (
    <section aria-label="Abrechnungsübersicht">
      <h3>Abrechnungsübersicht</h3>
      <dl className="detail-grid">
        {data.pricingMode === "BASE_PLUS_METER" ? (
          <>
            <div>
              <dt>Abrechenbare Messpunkte</dt>
              <dd>{data.billableMeterCount}</dd>
            </div>
            <div>
              <dt>Grundpreis</dt>
              <dd>{format(data.basePriceAmount)}</dd>
            </div>
            <div>
              <dt>Preis je Messpunkt</dt>
              <dd>{format(data.pricePerMeterAmount)}</dd>
            </div>
            <div>
              <dt>Messpunktkosten</dt>
              <dd>
                {data.billableMeterCount} × {format(data.pricePerMeterAmount)} ={" "}
                {format(data.meterCostAmount)}
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Festpreis</dt>
            <dd>{format(data.priceAmount)}</dd>
          </div>
        )}
        <div>
          <dt>Gesamtpreis</dt>
          <dd>
            {format(data.effectivePriceAmount)} /{" "}
            {data.billingInterval === "YEARLY" ? "Jahr" : "Monat"}
          </dd>
        </div>
        <div>
          <dt>Abrechnungsintervall</dt>
          <dd>
            {data.billingInterval === "YEARLY" ? "Jährlich" : "Monatlich"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
