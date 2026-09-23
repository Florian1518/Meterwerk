"use client";
import { useState } from "react";
export function AnalyticsDashboard({ tenantId }: { tenantId: string }) {
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState("2026-01-31");
  const [data, setData] = useState<{
    totals?: Record<string, string>;
    series?: { period: string; consumption: string; cost: string }[];
  }>({});
  const [anomalies, setAnomalies] = useState<
    { type: string; severity: string; description: string }[]
  >([]);
  const [message, setMessage] = useState("");
  async function load() {
    setMessage("");
    const query = `from=${encodeURIComponent(`${from}T00:00:00Z`)}&to=${encodeURIComponent(`${to}T23:59:59Z`)}&resolution=day&timezone=UTC&tenantId=${encodeURIComponent(tenantId)}`;
    const [a, b] = await Promise.all([
      fetch(`/api/analytics?${query}`),
      fetch(`/api/analytics/insights?${query}`),
    ]);
    if (!a.ok || !b.ok) {
      setMessage("Analytics konnten nicht geladen werden.");
      return;
    }
    setData(await a.json());
    setAnomalies((await b.json()).anomalies ?? []);
  }
  return (
    <main className="space-y-6">
      <div className="panel">
        <h1>Advanced Analytics</h1>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="field">
            Von
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field">
            Bis
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button className="button" onClick={load}>
            Laden
          </button>
        </div>
        {message && <p role="status">{message}</p>}
      </div>
      <section className="panel">
        <h2>Kennzahlen</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt>Verbrauch</dt>
            <dd>{data.totals?.consumption ?? "—"}</dd>
          </div>
          <div>
            <dt>Kosten</dt>
            <dd>{data.totals?.cost ?? "—"}</dd>
          </div>
          <div>
            <dt>Vorperiode</dt>
            <dd>{data.totals?.previousConsumption ?? "—"}</dd>
          </div>
          <div>
            <dt>Peak</dt>
            <dd>{data.totals?.peak ?? "—"}</dd>
          </div>
          <div>
            <dt>Grundlast</dt>
            <dd>{data.totals?.baseLoad ?? "—"}</dd>
          </div>
          <div>
            <dt>Veränderung</dt>
            <dd>{data.totals?.changePercent ?? "—"}%</dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <h2>Lastprofil</h2>
        <table className="data-table">
          <caption>
            Aggregierte Tageswerte als Tabellenversion der Zeitreihe
          </caption>
          <thead>
            <tr>
              <th>Zeitraum</th>
              <th>Verbrauch</th>
              <th>Kosten</th>
            </tr>
          </thead>
          <tbody>
            {(data.series ?? []).map((row) => (
              <tr key={row.period}>
                <td>{row.period}</td>
                <td>{row.consumption}</td>
                <td>{row.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>Anomalien</h2>
        {anomalies.length ? (
          <ul>
            {anomalies.map((item, i) => (
              <li key={`${item.type}-${i}`}>
                <strong>
                  {item.severity}: {item.type}
                </strong>{" "}
                – {item.description}
              </li>
            ))}
          </ul>
        ) : (
          <p>Keine Anomalien im Zeitraum.</p>
        )}
      </section>
    </main>
  );
}
