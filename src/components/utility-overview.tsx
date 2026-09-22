import { decimal, currency, dateTime, unitLabel } from "@/lib/format";
import { utilityReport } from "@/server/utility";
export async function UtilityOverview({
  tenantId,
  meterId,
  report: suppliedReport,
}: {
  tenantId: string;
  meterId?: string;
  report?: Awaited<ReturnType<typeof utilityReport>>;
}) {
  const report = suppliedReport ?? (await utilityReport(tenantId, meterId));
  return (
    <section className="panel">
      <h2>Medienübersicht</h2>
      <p>
        Berichtszeitzone UTC · Verbrauch ohne ungültige/verdächtige Messwerte.
        Kosten sind eine Orientierung, keine Abrechnung.
      </p>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Medienübersicht, horizontal scrollbar"
      >
        <table>
          <caption>Verbrauch, Vergleichszeiträume und Kosten je Medium</caption>
          <thead>
            <tr>
              <th>Medium</th>
              <th>Heute / gestern</th>
              <th>Monat / Vormonat / Vorjahresmonat</th>
              <th>Jahr / Vorjahr</th>
              <th>Kosten Monat</th>
              <th>Aktiv / offline</th>
              <th>Offene Alarme</th>
            </tr>
          </thead>
          <tbody>
            {report.results
              .filter((r) => !meterId || r.meters > 0)
              .map((r) => (
                <tr key={r.utility}>
                  <th scope="row" className="utility-name">
                    {r.label} ({unitLabel(r.unit)})
                    {r.meters === 0 && (
                      <small> · Keine freigegebenen Zähler</small>
                    )}
                  </th>
                  <td>
                    {decimal(r.totals.today)} / {decimal(r.totals.yesterday)}
                  </td>
                  <td>
                    {decimal(r.totals.month)} /{" "}
                    {decimal(r.totals.previousMonth)} /{" "}
                    {decimal(r.totals.previousYearMonth)}
                  </td>
                  <td>
                    {decimal(r.totals.year)} / {decimal(r.totals.previousYear)}
                  </td>
                  <td>
                    {r.cost === null
                      ? "Tarifdeckung unvollständig"
                      : currency(r.cost)}
                  </td>
                  <td>
                    {r.active} / {r.offline}
                  </td>
                  <td>{r.alarms}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Vergleichszeiträume (UTC)</summary>
        {Object.entries(report.periods).map(([k, v]) => (
          <p key={k}>
            {
              (
                {
                  today: "Heute",
                  yesterday: "Gestern",
                  month: "Aktueller Monat",
                  previousMonth: "Vormonat",
                  previousYearMonth: "Vorjahresmonat",
                  year: "Aktuelles Jahr",
                  previousYear: "Vorjahr",
                } as Record<string, string>
              )[k]
            }
            : {v.map((value) => dateTime(value, "UTC")).join(" bis ")}
          </p>
        ))}
        <p>
          Laufende Zeiträume sind unvollständig; Vergleichsmonate und Vorjahr
          werden vollständig ausgewiesen. Grundpreis wird zeitanteilig pro Tag
          berechnet. Intervallverbrauch wird dem Zeitpunkt des Endstands
          zugeordnet.
        </p>
      </details>
    </section>
  );
}
