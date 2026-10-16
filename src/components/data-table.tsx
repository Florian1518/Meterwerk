"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
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
  statusColumn,
}: {
  headers: string[];
  rows: TableRow[];
  statusColumn?: number;
  editor?: { kind: string; tenantId?: string; fields: Field[] };
}) {
  const search = useSearchParams();
  const query = search.get("q") ?? "";
  const status = search.get("status") ?? "";
  function update(key: string, value: string) {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    window.history.replaceState(null, "", `?${next}`);
    setPage(0);
  }
  const [sort, setSort] = useState<{
    column: number;
    direction: "asc" | "desc";
  }>({ column: 0, direction: "asc" });
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const filtered = rows.filter(
    (row) =>
      row.cells.join(" ").toLowerCase().includes(query.toLowerCase()) &&
      (statusColumn === undefined ||
        !status ||
        row.cells[statusColumn] === status),
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
  const currentPage = Math.min(page, pages - 1);
  const visible = sorted.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
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
            onChange={(e) => {
              update("q", e.target.value);
            }}
          />
        </div>
        {statusColumn !== undefined && (
          <label>
            Alarmstatus
            <select
              aria-label="Alarmstatus"
              value={status}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">Alle Status</option>
              {["Offen", "Bestätigt", "Erledigt"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <span role="status">
          {filtered.length} Einträge
          {rows.length === 200 && editor?.kind !== "users" ? " · max. 200" : ""}
        </span>
      </div>
      <div
        className="table-scroll"
        role="region"
        aria-label="Datentabelle, horizontal scrollbar"
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">{headers.join(" · ")}</caption>
          <thead>
            <tr>
              {headers.map((h, index) => (
                <th
                  key={h}
                  scope="col"
                  aria-sort={
                    sort.column === index
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
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
              Seite {currentPage + 1} von {pages}
            </span>
            <div>
              <button
                className="button-secondary"
                disabled={currentPage === 0}
                onClick={() => setPage(Math.max(0, currentPage - 1))}
              >
                Zurück
              </button>
              <button
                className="button-secondary"
                disabled={currentPage >= pages - 1}
                onClick={() => setPage(Math.min(pages - 1, currentPage + 1))}
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
