"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  Bell,
  Building2,
  ChevronRight,
  Gauge,
  Home,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  Warehouse,
  Zap,
} from "lucide-react";
import { logoutAction } from "@/app/actions";
import type { Actor } from "@/server/policy";
const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tenants", label: "Kunden", icon: Warehouse, platform: true },
  { href: "/properties", label: "Liegenschaften", icon: Building2 },
  { href: "/buildings", label: "Gebäude", icon: Home },
  { href: "/units", label: "Nutzungseinheiten", icon: Building2 },
  { href: "/meters", label: "Zähler", icon: Gauge },
  {
    href: "/commissioning",
    label: "Inbetriebnahme",
    icon: Activity,
    manage: true,
  },
  { href: "/users", label: "Benutzer", icon: Users, manage: true },
  {
    href: "/system-status",
    label: "Systemstatus",
    icon: Activity,
    manage: true,
  },
  { href: "/alarms", label: "Alarme", icon: Bell },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];
export function Shell({
  actor,
  children,
}: {
  actor: Actor;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const tenant = params.get("tenantId");
  const suffix = tenant ? `?tenantId=${encodeURIComponent(tenant)}` : "";
  return (
    <div className="app-shell">
      <aside className="sidebar">
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
        <p className="nav-heading">WORKSPACE</p>
        <nav aria-label="Hauptnavigation">
          {navigation
            .filter(
              (item) =>
                (!item.platform || actor.role === "SUPER_ADMIN") &&
                (!item.manage ||
                  ["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role)),
            )
            .map((item) => (
              <Link
                aria-current={path === item.href ? "page" : undefined}
                className={path === item.href ? "nav-link active" : "nav-link"}
                href={`${item.href}${suffix}`}
                key={item.href}
              >
                <item.icon size={18} />
                {item.label}
                {path === item.href && <span className="nav-dot" />}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-card">
            <Activity size={18} />
            <strong>Demo-Umgebung</strong>
            <p>
              Realistische Beispieldaten.
              <br />
              Keine Geräte verbunden.
            </p>
          </div>
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
      <div className="main-shell">
        <header className="topbar">
          <div>
            Workspace <ChevronRight size={14} />
            <strong>
              {navigation.find((n) => n.href === path)?.label ?? "Übersicht"}
            </strong>
          </div>
          <span>
            <ShieldCheck size={15} /> Geschützter Bereich{" "}
            <span className="topbar-dot" /> DEMO
          </span>
        </header>
        <main className="page-content">{children}</main>
        <footer>
          © {new Date().getFullYear()} Meterwerk{" "}
          <span>Demo-Daten · Berichtszeitzone UTC</span>
        </footer>
      </div>
    </div>
  );
}
