"use client";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
type Result = {
  id: string;
  kind: string;
  label: string;
  detail: string;
  href: string;
};
export function GlobalSearch({ tenantId }: { tenantId?: string | null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      return;
    }
    timer.current = setTimeout(async () => {
      const params = new URLSearchParams({ q: query });
      if (tenantId) params.set("tenantId", tenantId);
      const response = await fetch(`/api/search?${params}`, {
        cache: "no-store",
      });
      if (response.ok) setResults((await response.json()) as Result[]);
    }, 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, tenantId]);
  return (
    <div
      className="global-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Search size={16} aria-hidden="true" />
      <input
        aria-label="Global suchen"
        placeholder="Kunden, Zähler, Geräte suchen …"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          if (event.target.value.trim().length < 2) setResults([]);
          setOpen(true);
        }}
      />
      {query && (
        <button
          className="search-clear"
          aria-label="Suche löschen"
          onClick={() => {
            setQuery("");
            setResults([]);
          }}
        >
          <X size={14} />
        </button>
      )}
      {open && query.length >= 2 && (
        <div className="search-results" role="listbox">
          {results.length ? (
            results.map((result) => (
              <Link
                key={`${result.kind}-${result.id}`}
                href={result.href}
                onClick={() => setOpen(false)}
              >
                <span className="search-kind">{result.kind}</span>
                <strong>{result.label}</strong>
                <small>{result.detail}</small>
              </Link>
            ))
          ) : (
            <p>Keine Treffer gefunden.</p>
          )}
        </div>
      )}
    </div>
  );
}
