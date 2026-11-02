"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  Building2,
  Gauge,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  Warehouse,
  Zap,
  FileText,
  CreditCard,
  KeyRound,
  Webhook,
  Upload,
  ClipboardCheck,
  Workflow,
  Radio,
} from "lucide-react";
import { logoutAction } from "@/app/actions";
import type { Actor } from "@/server/policy";
import { Breadcrumbs } from "./breadcrumbs";
import { GlobalSearch } from "./global-search";
import { DisplayPreferences } from "./display-preferences";
type NavItem = {
  href: string;
  label: string;
  icon: typeof Activity;
  manage?: boolean;
  platform?: boolean;
};
const navigation: { group: string; items: NavItem[] }[] = [
  {
    group: "ÜBERSICHT",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/portfolio", label: "Portfolio", icon: LayoutDashboard },
    ],
  },
  {
    group: "OBJEKTE",
    items: [
      { href: "/properties", label: "Liegenschaften", icon: Building2 },
      { href: "/buildings", label: "Gebäude", icon: Home },
      { href: "/units", label: "Nutzungseinheiten", icon: Building2 },
    ],
  },
  {
    group: "METERING",
    items: [
      { href: "/meters", label: "Zähler", icon: Gauge },
      {
        href: "/commissioning",
        label: "Inbetriebnahme",
        icon: Activity,
        manage: true,
      },
    ],
  },
  {
    group: "ANALYSE",
    items: [
      { href: "/reports", label: "Berichte", icon: FileText },
      { href: "/analytics", label: "Analytics", icon: Activity },
      { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
      { href: "/alarms", label: "Alarme", icon: Bell },
    ],
  },
  {
    group: "BETRIEB",
    items: [
      { href: "/work-orders", label: "Einsätze", icon: ClipboardCheck },
      { href: "/technician", label: "Meine Einsätze", icon: ListChecks },
      {
        href: "/system-status",
        label: "Systemstatus",
        icon: Activity,
        manage: true,
      },
      {
        href: "/onboarding",
        label: "Onboarding",
        icon: ListChecks,
        manage: true,
      },
    ],
  },
  {
    group: "ADMINISTRATION",
    items: [
      { href: "/users", label: "Benutzer", icon: Users, manage: true },
      { href: "/settings", label: "Einstellungen", icon: Settings },
      {
        href: "/billing",
        label: "Plan und Nutzung",
        icon: CreditCard,
        manage: true,
      },
      {
        href: "/api-keys",
        label: "Public API-Keys",
        icon: KeyRound,
        manage: true,
      },
      { href: "/webhooks", label: "Webhooks", icon: Webhook, manage: true },
      { href: "/imports", label: "Datenimport", icon: Upload, manage: true },
      {
        href: "/data-quality",
        label: "Datenqualität",
        icon: ClipboardCheck,
        manage: true,
      },
      { href: "/rules", label: "Regeln", icon: Workflow, manage: true },
      { href: "/tenants", label: "Kunden", icon: Warehouse, platform: true },
      {
        href: "/platform-admin/gateways",
        label: "Gateways & Geräte",
        icon: Radio,
        platform: true,
      },
      {
        href: "/platform-admin",
        label: "Plattformverwaltung",
        icon: ShieldCheck,
        platform: true,
      },
    ],
  },
];
export function Shell({
  actor,
  preferences,
  environment,
  children,
}: {
  actor: Actor;
  preferences: { theme: string; timeZone: string };
  environment: "demo" | "staging" | "production";
  children: React.ReactNode;
}) {
  const path = usePathname();
  const environmentLabel =
    environment === "demo"
      ? "DEMO"
      : environment === "staging"
        ? "STAGING"
        : null;
  const params = useSearchParams();
  const tenant = params.get("tenantId");
  const suffix = tenant ? `?tenantId=${encodeURIComponent(tenant)}` : "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileItems = navigation
    .flatMap((section) => section.items)
    .filter((item) =>
      [
        "/dashboard",
        "/analytics",
        "/meters",
        "/alarms",
        "/settings",
        "/platform-admin/gateways",
      ].includes(item.href),
    )
    .filter(
      (item) =>
        (!item.manage ||
          ["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role)) &&
        (!item.platform || actor.role === "SUPER_ADMIN"),
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Zum Inhalt springen
      </a>
      <button
        className="mobile-menu-button"
        aria-expanded={mobileOpen}
        aria-controls="mobile-navigation"
        onClick={() => setMobileOpen((value) => !value)}
      >
        Menü
      </button>
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <Link href={`/dashboard${suffix}`} className="brand">
          <span className="brand-icon">
            <Zap size={23} />
          </span>
          meterwerk<span className="brand-dot">.</span>
        </Link>
        <div className="workspace">
          <span className="workspace-symbol">
            <Building2 size={18} />
          </span>
          <div>
            <strong>
              {actor.role === "SUPER_ADMIN"
                ? "Plattformverwaltung"
                : "Kundenbereich"}
            </strong>
            <small>Smart Metering Workspace</small>
          </div>
        </div>
        <nav aria-label="Hauptnavigation">
          {navigation.map((section) => {
            const items = section.items.filter(
              (item) =>
                (!item.platform || actor.role === "SUPER_ADMIN") &&
                (!item.manage ||
                  ["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role)),
            );
            if (!items.length) return null;
            return (
              <div className="nav-section" key={section.group}>
                <p className="nav-heading">{section.group}</p>
                {items.map((item) => (
                  <Link
                    aria-current={
                      path === item.href || path.startsWith(`${item.href}/`)
                        ? "page"
                        : undefined
                    }
                    className={
                      path === item.href || path.startsWith(`${item.href}/`)
                        ? "nav-link active"
                        : "nav-link"
                    }
                    href={`${item.href}${suffix}`}
                    key={item.href}
                  >
                    <item.icon size={17} />
                    {item.label}
                    {(path === item.href ||
                      path.startsWith(`${item.href}/`)) && (
                      <span className="nav-dot" />
                    )}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <DisplayPreferences {...preferences} />
          {environmentLabel && (
            <div className="demo-card">
              <Activity size={18} />
              <strong>Demo-Umgebung</strong>
              <p>
                Realistische Beispieldaten.
                <br />
                Keine Geräte verbunden.
              </p>
            </div>
          )}
          <div className="user-profile">
            <span className="avatar">
              {actor.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{actor.name}</strong>
              <small>{actor.role.replaceAll("_", " ")}</small>
            </div>
            <form action={logoutAction}>
              <button aria-label="Abmelden" title="Abmelden">
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <nav
        id="mobile-navigation"
        className="mobile-bottom-nav"
        aria-label="Mobile Navigation"
      >
        {mobileItems.map((item) => (
          <Link
            key={item.href}
            href={`${item.href}${suffix}`}
            aria-current={path === item.href ? "page" : undefined}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="main-shell">
        <header className="topbar">
          <Breadcrumbs />
          <div className="topbar-tools">
            <GlobalSearch tenantId={tenant} />
            <span className="protected-label">
              <ShieldCheck size={15} /> Geschützter Bereich{" "}
              {environmentLabel && (
                <>
                  <span className="topbar-dot" /> {environmentLabel}
                </>
              )}
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="page-content">
          {children}
        </main>
        <footer>
          © {new Date().getFullYear()} Meterwerk{" "}
          <span>Anzeige: {preferences.timeZone} · Berichtszeiträume: UTC</span>
        </footer>
      </div>
    </div>
  );
}
