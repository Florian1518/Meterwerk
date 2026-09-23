import Link from "next/link";
import type { importHistory } from "@/server/data-imports";

const statuses: Record<string, string> = {
  PREVIEWED: "Vorschau",
  COMPLETED: "Abgeschlossen",
  EXPIRED: "Abgelaufen",
};
export function ImportHistory({
  data,
  tenantId,
  cursor,
}: {
  data: Awaited<ReturnType<typeof importHistory>>;
  tenantId: string;
  cursor?: string;
}) {
  const base = `/imports?tenantId=${encodeURIComponent(tenantId)}`;
  return (
    <section className="panel space-y-4">
      <h2>Import-Historie</h2>
      <div className="overflow-auto">
        <table className="data-table">
          <caption>
            Importe des ausgewählten Mandanten · Zeitangaben in UTC · 25 pro
            Seite
          </caption>
          <thead>
            <tr>
              {[
                "Datei",
                "Benutzer",
                "Zeitpunkt (UTC)",
                "Datentyp",
                "Datensätze",
                "Erfolgreich",
                "Fehlerhaft",
                "Übersprungen",
                "Status",
              ].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <tr key={row.id}>
                <td>{row.fileName}</td>
                <td>{row.actorName || row.actorId}</td>
                <td>{row.createdAt.replace("T", " ")}</td>
                <td>{row.resource}</td>
                <td>{row.rowCount}</td>
                <td>{row.successCount}</td>
                <td>{row.errorCount}</td>
                <td>{row.skippedCount}</td>
                <td>{statuses[row.status] ?? row.status}</td>
              </tr>
            ))}
            {!data.items.length && (
              <tr>
                <td colSpan={9}>Noch keine Importe vorhanden.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Fehlerhaft zählt betroffene Zeilen, nicht einzelne Meldungen.
        Unverarbeitete gültige Vorschauzeilen sind noch nicht erfolgreich
        importiert.
      </p>
      <nav aria-label="Seiten der Import-Historie" className="flex gap-4">
        {cursor && <Link href={base}>Neueste Importe</Link>}
        {data.nextCursor && (
          <Link href={`${base}&cursor=${encodeURIComponent(data.nextCursor)}`}>
            Ältere Importe
          </Link>
        )}
      </nav>
    </section>
  );
}
