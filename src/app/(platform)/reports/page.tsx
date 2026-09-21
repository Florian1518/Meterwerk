import Link from "next/link";
import { pageContext } from "@/server/page-context";
import { listReports } from "@/server/customer-portal";
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const ctx = await pageContext((await searchParams).tenantId);
  const reports = await listReports(ctx.tenantId);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">AUSWERTUNGEN</div>
          <h1>Berichte</h1>
          <p>
            Verbrauchs- und Kostenanalyse, keine rechtsverbindliche Abrechnung.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Gespeicherte Berichte</h2>
            <p>PDF und CSV stehen je Bericht zum Download bereit.</p>
          </div>
        </div>
        {reports.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Typ</th>
                  <th>Zeitraum</th>
                  <th>Erstellt</th>
                  <th>Export</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.title}</td>
                    <td>{report.type}</td>
                    <td>
                      {report.periodFrom.toISOString().slice(0, 10)} –{" "}
                      {report.periodTo.toISOString().slice(0, 10)}
                    </td>
                    <td>
                      {report.createdAt
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}{" "}
                      UTC
                    </td>
                    <td>
                      <Link
                        href={`/api/reports/${report.id}/export?format=pdf&tenantId=${ctx.tenantId}`}
                      >
                        PDF
                      </Link>{" "}
                      ·{" "}
                      <Link
                        href={`/api/reports/${report.id}/export?format=csv&tenantId=${ctx.tenantId}`}
                      >
                        CSV
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Noch keine Berichte erstellt.</p>
        )}
      </section>
    </>
  );
}
