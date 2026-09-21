"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
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
  const [sort, setSort] = useState<{
    column: number;
    direction: "asc" | "desc";
  }>({ column: 0, direction: "asc" });
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const filtered = rows.filter((row) =>
    row.cells.join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const sorted = [...filtered].sort((a, b) => {
    const result = (a.cells[sort.column] ?? "").localeCompare(
      b.cells[sort.column] ?? "",
      "de",
      { numeric: true, sensitivity: "base" },
    );
    return sort.direction === "asc" ? result : -result;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const visible = sorted.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <div className="panel table-panel" aria-live="polite">
      <div className="table-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Einträge durchsuchen"
            placeholder="Einträge durchsuchen …"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
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
              {headers.map((h, index) => (
                <th key={h}>
                  <button
                    className="table-sort"
                    onClick={() =>
                      setSort((current) => ({
                        column: index,
                        direction:
                          current.column === index &&
                          current.direction === "asc"
                            ? "desc"
                            : "asc",
                      }))
                    }
                  >
                    {h}
                    {sort.column === index &&
                      (sort.direction === "asc" ? (
                        <ChevronUp size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      ))}
                  </button>
                </th>
              ))}
              {editor && <th>Aktionen</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
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
        {filtered.length > 0 && (
          <div className="table-pagination">
            <span>
              Seite {page + 1} von {pages}
            </span>
            <div>
              <button
                className="button-secondary"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Zurück
              </button>
              <button
                className="button-secondary"
                disabled={page >= pages - 1}
                onClick={() =>
                  setPage((current) => Math.min(pages - 1, current + 1))
                }
              >
                Weiter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
