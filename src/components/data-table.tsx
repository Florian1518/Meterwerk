"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { EntryActions } from "./entry-actions";
import type { Field } from "./create-form";
export type TableRow = {
  id: string;
  cells: string[];
  href?: string;
  values?: Record<string, string>;
};
export function DataTable({
  headers,
  rows,
  editor,
}: {
  headers: string[];
  rows: TableRow[];
  editor?: { kind: string; tenantId?: string; fields: Field[] };
}) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((row) =>
    row.cells.join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="panel table-panel">
      <div className="table-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Einträge durchsuchen"
            placeholder="Einträge durchsuchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span>
          {filtered.length} Einträge{rows.length === 200 ? " · max. 200" : ""}
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
              {editor && <th>Aktionen</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell, i) => (
                  <td key={i}>
                    {i === 0 && row.href ? (
                      <a className="text-link" href={row.href}>
                        {cell}
                      </a>
                    ) : [
                        "Aktiv",
                        "Offen",
                        "Offline",
                        "Erledigt",
                        "Bestätigt",
                        "Wartung",
                      ].includes(cell) ? (
                      <span
                        className={`badge ${["Offline", "Offen"].includes(cell) ? "badge-warning" : ""}`}
                      >
                        {cell}
                      </span>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
                {editor && (
                  <td>
                    <EntryActions
                      key={JSON.stringify(row.values)}
                      {...editor}
                      id={row.id}
                      name={row.cells[0]}
                      values={row.values ?? {}}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty-state">
            <strong>Keine Einträge gefunden</strong>
            <p>Hier erscheinen die für Sie verfügbaren Daten.</p>
          </div>
        )}
      </div>
    </div>
  );
}
