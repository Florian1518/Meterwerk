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
      <div className="overflow-x-auto">
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
                  <th>
                    {r.label} ({r.unit})
                    {r.meters === 0 && (
                      <small> · Keine freigegebenen Zähler</small>
                    )}
                  </th>
                  <td>
                    {r.totals.today} / {r.totals.yesterday}
                  </td>
                  <td>
                    {r.totals.month} / {r.totals.previousMonth} /{" "}
                    {r.totals.previousYearMonth}
                  </td>
                  <td>
                    {r.totals.year} / {r.totals.previousYear}
                  </td>
                  <td>
                    {r.cost === null
                      ? "Tarifdeckung unvollständig"
                      : `${r.cost} €`}
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
            : {v.join(" bis ")}
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
