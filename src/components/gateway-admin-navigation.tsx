import Link from "next/link";
export function GatewayAdminTabs({ devices = false }: { devices?: boolean }) {
  return (
    <nav aria-label="Gateways und Geräte" className="mb-5 flex gap-5">
      <Link
        className="text-link"
        aria-current={!devices ? "page" : undefined}
        href="/platform-admin/gateways"
      >
        Gateways
      </Link>
      <Link
        className="text-link"
        aria-current={devices ? "page" : undefined}
        href="/platform-admin/gateways/devices"
      >
        Geräte
      </Link>
    </nav>
  );
}
export function AdminPagination({
  page,
  pages,
  total,
  path,
  query,
}: {
  page: number;
  pages: number;
  total: number;
  path: string;
  query: Record<string, string | undefined>;
}) {
  const href = (next: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value && key !== "page") params.set(key, value);
    params.set("page", String(next));
    return `${path}?${params}`;
  };
  return (
    <nav className="table-pagination" aria-label="Seitennavigation">
      <span>
        {total} Einträge · Seite {page} von {Math.max(1, pages)}
      </span>
      <div>
        {page > 1 && (
          <Link className="text-link" href={href(page - 1)}>
            Zurück
          </Link>
        )}
        {page < pages && (
          <Link className="text-link" href={href(page + 1)}>
            Weiter
          </Link>
        )}
      </div>
    </nav>
  );
}
