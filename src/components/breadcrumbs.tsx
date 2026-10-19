"use client";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
const labels: Record<string, string> = {
  dashboard: "Dashboard",
  portfolio: "Portfolio",
  properties: "Liegenschaften",
  buildings: "Gebäude",
  units: "Nutzungseinheiten",
  meters: "Zähler",
  reports: "Berichte",
  alarms: "Alarme",
  commissioning: "Inbetriebnahme",
  onboarding: "Onboarding",
  "system-status": "Systemstatus",
  settings: "Einstellungen",
  billing: "Plan und Nutzung",
  "api-keys": "Public API-Keys",
  webhooks: "Webhooks",
  "platform-admin": "Plattformverwaltung",
  gateways: "Gateways & Geräte",
  devices: "Geräte",
};
export function Breadcrumbs() {
  const pathname = usePathname();
  const search = useSearchParams();
  const tenant = search.get("tenantId");
  const parts = pathname.split("/").filter(Boolean);
  return (
    <nav className="breadcrumbs" aria-label="Brotkrümelnavigation">
      <Link
        href={`/dashboard${tenant ? `?tenantId=${encodeURIComponent(tenant)}` : ""}`}
        aria-label="Startseite"
      >
        <Home size={14} />
      </Link>
      {parts.map((part, index) => {
        const href = `/${parts.slice(0, index + 1).join("/")}${tenant ? `?tenantId=${encodeURIComponent(tenant)}` : ""}`;
        return (
          <span key={`${part}-${index}`}>
            <ChevronRight size={13} />
            <Link href={href}>
              {labels[part] ??
                (index === parts.length - 1 && part.length > 12
                  ? `${part.slice(0, 8)}…`
                  : part)}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
