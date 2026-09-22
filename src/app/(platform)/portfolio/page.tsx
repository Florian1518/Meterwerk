export const metadata = { title: "Portfolio · Meterwerk" };
import { decimal, unitLabel } from "@/lib/format";
import Link from "next/link";
import { pageContext } from "@/server/page-context";
import { portfolio } from "@/server/customer-portal";
import { number } from "@/lib/utils";
export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const ctx = await pageContext((await searchParams).tenantId);
  const data = await portfolio(ctx.tenantId);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KUNDENPORTAL</div>
          <h1>
            Portfolioübersicht <span className="badge demo-badge">Demo</span>
          </h1>
          <p>Getrennte Auswertungen für Strom, Wasser, Gas und Wärme.</p>
        </div>
      </div>
      <div className="kpi-grid">
        {Object.entries(data.counts).map(([key, value]) => (
          <section className="kpi" key={key}>
            <div className="kpi-title">
              {key === "alarms"
                ? "Offene Alarme"
                : key[0].toUpperCase() + key.slice(1)}
            </div>
            <div className="kpi-value">{value}</div>
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Medien</h2>
            <p>Einheiten werden nicht zusammenaddiert.</p>
          </div>
        </div>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Medienvergleich, horizontal scrollbar"
        >
          <table>
            <thead>
              <tr>
                <th>Medium</th>
                <th>Zähler</th>
                <th>Monat</th>
                <th>Jahr</th>
                <th>Vorjahresvergleich</th>
                <th>Einheit</th>
              </tr>
            </thead>
            <tbody>
              {data.byUtility.map((row) => (
                <tr key={row.utility}>
                  <td>{row.label}</td>
                  <td>{row.meters}</td>
                  <td>{number(row.month)}</td>
                  <td>{number(row.year)}</td>
                  <td>
                    {row.changePercent === null
                      ? "—"
                      : `${number(row.changePercent)} %`}
                  </td>
                  <td>{unitLabel(row.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Größte Verbraucher</h2>
        {data.largest.length ? (
          <ul>
            {data.largest.map((item) => (
              <li key={`${item.meterId}-${item.timestamp}`}>
                <Link href={`/meters/${item.meterId}?tenantId=${ctx.tenantId}`}>
                  {item.meterId}
                </Link>{" "}
                · {decimal(item.value)}
              </li>
            ))}
          </ul>
        ) : (
          <p>Noch keine Messwerte.</p>
        )}
      </section>
    </>
  );
}
