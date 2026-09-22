"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Entry = { id: string; favorite: boolean };
/** IDs only, per user and tenant, tab lifetime. Links never grant access. */
export function RecentMeters({
  userId,
  tenantId,
  meterId,
}: {
  userId: string;
  tenantId: string;
  meterId: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const key = `meterwerk:meters:${userId}:${tenantId}`;
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
      const old = Array.isArray(raw)
        ? raw
            .filter(
              (v): v is Entry =>
                v &&
                typeof v.id === "string" &&
                typeof v.favorite === "boolean",
            )
            .slice(0, 20)
        : [];
      const next = [
        {
          id: meterId,
          favorite: old.find((v) => v.id === meterId)?.favorite ?? false,
        },
        ...old.filter((v) => v.id !== meterId),
      ].slice(0, 20);
      sessionStorage.setItem(key, JSON.stringify(next));
      queueMicrotask(() => setEntries(next));
    } catch {
      queueMicrotask(() => setUnavailable(true));
    }
  }, [key, meterId]);
  function save(next: Entry[]) {
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
      setEntries(next);
    } catch {
      setUnavailable(true);
    }
  }
  return (
    <section
      className="recent-meters"
      aria-label="Persönliche Zählerverknüpfungen"
    >
      <button
        className="button-secondary"
        disabled={unavailable || !entries.length}
        aria-pressed={entries.find((v) => v.id === meterId)?.favorite ?? false}
        onClick={() =>
          save(
            entries.map((v) =>
              v.id === meterId ? { ...v, favorite: !v.favorite } : v,
            ),
          )
        }
      >
        Zähler als Favorit merken
      </button>
      <details>
        <summary>Favoriten und zuletzt geöffnete Zähler</summary>
        <p>
          Nur in diesem Browser-Tab · maximal 20 Verknüpfungen · Zugriffsrechte
          werden beim Öffnen geprüft.
        </p>
        {unavailable ? (
          <p role="status">Browserspeicher nicht verfügbar.</p>
        ) : (
          <ul>
            {[...entries]
              .sort((a, b) => Number(b.favorite) - Number(a.favorite))
              .map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/meters/${encodeURIComponent(v.id)}?tenantId=${encodeURIComponent(tenantId)}`}
                  >
                    {v.favorite ? "★ Favorit · " : ""}
                    {v.id}
                    {v.id === meterId ? " (aktuell)" : ""}
                  </Link>
                </li>
              ))}
          </ul>
        )}
        <button
          className="button-secondary"
          onClick={() => save([{ id: meterId, favorite: false }])}
        >
          Verlauf und Favoriten leeren
        </button>
      </details>
    </section>
  );
}
