"use client";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
type Result = {
  id: string;
  kind: string;
  label: string;
  detail: string;
  href: string;
};
export function GlobalSearch({ tenantId }: { tenantId?: string | null }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    query: string;
    tenant?: string | null;
    rows: Result[];
    error?: string;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const current =
    result?.query === query && result.tenant === tenantId ? result : null;
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query });
        if (tenantId) params.set("tenantId", tenantId);
        const response = await fetch(`/api/search?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Suche fehlgeschlagen.");
        const rows = (await response.json()) as Result[];
        if (!controller.signal.aborted)
          setResult({ query, tenant: tenantId, rows });
      } catch {
        if (!controller.signal.aborted)
          setResult({
            query,
            tenant: tenantId,
            rows: [],
            error:
              "Suche nicht verfügbar. Bitte Eingabe ändern und erneut versuchen.",
          });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, tenantId]);
  const visible = open && query.trim().length >= 2;
  return (
    <div
      className="global-search"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          input.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <Search size={16} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        aria-label="Global suchen"
        aria-controls={visible ? id : undefined}
        placeholder="Kunden, Zähler, Geräte suchen …"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {query && (
        <button
          className="search-clear"
          aria-label="Suche löschen"
          onClick={() => {
            setQuery("");
            input.current?.focus();
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
      {visible && (
        <div className="search-results" id={id}>
          <p role="status">
            {!current
              ? "Suche läuft …"
              : (current.error ?? `${current.rows.length} Treffer gefunden.`)}
          </p>
          {!!current?.rows.length && (
            <nav aria-label="Suchergebnisse">
              {current.rows.map((row) => (
                <Link
                  key={`${row.kind}-${row.id}`}
                  href={row.href}
                  onClick={() => setOpen(false)}
                >
                  <span className="search-kind">{row.kind}</span>
                  <strong>{row.label}</strong>
                  <small>{row.detail}</small>
                </Link>
              ))}
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
