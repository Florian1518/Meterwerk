import Link from "next/link";
import {
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Gauge,
  Radio,
  Zap,
} from "lucide-react";
import { pageContext } from "@/server/page-context";
import { dashboard, typeLabels } from "@/server/dashboard";
import type { MeterType } from "@/generated/prisma/client";
import { number } from "@/lib/utils";
import { ConsumptionChart } from "@/components/chart";
import { TenantSelect } from "@/components/tenant-select";
import { DashboardRefresh } from "@/components/dashboard-refresh";
import { UtilityOverview } from "@/components/utility-overview";
import { utilityReport } from "@/server/utility";
import { DashboardControls } from "@/components/dashboard-controls";
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    tenantId?: string;
    type?: string;
    days?: string;
    propertyId?: string;
  }>;
}) {
  const params = await searchParams;
  const ctx = await pageContext(params.tenantId);
  const type: MeterType =
    params.type && Object.hasOwn(typeLabels, params.type)
      ? (params.type as MeterType)
      : "ELECTRICITY";
  const days = [7, 30, 90].includes(Number(params.days))
    ? Number(params.days)
    : 30;
  const data = await dashboard(ctx.actor, ctx.tenantId, type, {
    days,
    propertyId: params.propertyId,
  });
  const report = await utilityReport(ctx.tenantId);
  const cost = report.results.find((r) => r.utility === type)?.cost ?? null;
  const suffix = `?tenantId=${encodeURIComponent(ctx.tenantId)}`;
  const max = Math.max(...data.properties.map((p) => p.value), 1);
  const kpis = [
    {
      label: "Verbrauch heute",
      value: number(data.today),
      unit: data.unit,
      note: "Seit 00:00 Uhr · UTC",
      icon: Zap,
    },
    {
      label: "Verbrauch diesen Monat",
      value: number(data.month),
      unit: data.unit,
      note: "Laufender Monat bis heute",
      icon: CalendarDays,
    },
    {
      label: "Vorjahresmonat",
      value: number(data.previous),
      unit: data.unit,
      note: "Vollständiger Vergleichsmonat",
      icon: ArrowUpRight,
    },
    {
      label: "Geschätzte Kosten",
      value: cost === null ? "—" : cost,
      unit: "€",
      note: "Monat · historische Tarife; — bei Tariflücken",
      icon: CircleDollarSign,
    },
  ];
  return (
    <>
      <DashboardRefresh />
      <UtilityOverview tenantId={ctx.tenantId} report={report} />
      {data.edgeDevices.length > 0 && (
        <section
          aria-label="Edge-Geräte"
          className="mb-4 rounded-lg border p-4"
        >
          <h2>Edge-Geräte</h2>
          {data.edgeDevices.map((device) => (
            <p key={device.serialNumber}>
              {device.gateway.name}: <strong>{device.gateway.status}</strong> ·{" "}
              {device.serialNumber}: <strong>{device.status}</strong> · Letzter
              Messwert: {device.lastSeenAt?.toISOString() ?? "Noch keine Daten"}
            </p>
          ))}
        </section>
      )}
      <div className="page-heading">
        <div>
          <div className="eyebrow">ENERGIE IM BLICK</div>
          <h1>
            Dashboard<span className="badge demo-badge">Demo</span>
          </h1>
          <p>Ihr Energieportfolio. Alle wichtigen Kennzahlen an einem Ort.</p>
        </div>
        <div className="heading-tools">
          <TenantSelect tenants={ctx.tenants} tenantId={ctx.tenantId} />
          <span className="date-label">
            <CalendarDays size={15} />
            {new Date().toLocaleDateString("de-DE", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </span>
        </div>
      </div>
      <DashboardControls
        properties={data.propertyOptions}
        tenantId={ctx.tenantId}
        type={type}
        days={days}
        propertyId={params.propertyId}
      />
      <div className="portfolio-bar">
        <span>
          <Building2 size={17} />
          <strong>{ctx.tenant.name}</strong>
          <span className="muted">/ Portfolioübersicht</span>
        </span>
        <span className="status-dot-label">
          <i />{" "}
          {data.lastDataReceived
            ? `${data.hasActualData ? "Echte Ingestion-Daten" : "Demo-Messwerte"} · Letzter Empfang ${new Date(data.lastDataReceived).toLocaleString("de-DE", { timeZone: "UTC" })} UTC`
            : "Keine Messung empfangen"}
        </span>
        <span
          className="data-quality"
          title="Qualität der in diesem Zeitraum eingegangenen Messwerte"
        >
          Datenqualität:{" "}
          {data.dataQuality === "NO_DATA"
            ? "Keine Daten"
            : data.dataQuality === "DEMO"
              ? "Demo"
              : "Gemischt"}
        </span>
      </div>
      <div className="tab-row" aria-label="Zählerart">
        {Object.entries(typeLabels).map(([key, label]) => (
          <Link
            key={key}
            aria-current={key === type ? "page" : undefined}
            className={key === type ? "type-tab selected" : "type-tab"}
            href={`/dashboard${suffix}&type=${key}`}
          >
            {label}
          </Link>
        ))}
        <span className="tab-note">
          Alle Angaben für {typeLabels[type].toLowerCase()}
        </span>
      </div>
      <div className="kpi-grid">
        {kpis.map((kpi, i) => (
          <section
            key={kpi.label}
            className={`kpi ${i === 1 ? "kpi-accent" : ""}`}
          >
            <div className="kpi-title">
              {kpi.label}
              <kpi.icon size={17} />
            </div>
            <div className="kpi-value">
              {kpi.value}
              <span>{kpi.unit}</span>
            </div>
            <small>{kpi.note}</small>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Verbrauchsverlauf</h2>
              <p>
                {typeLabels[type]} · Tagesverbrauch in {data.unit}
              </p>
            </div>
            <span className="chart-legend">
              <i /> Verbrauch
            </span>
          </div>
          <ConsumptionChart days={data.byDay} unit={data.unit} />
        </section>
        <section className="panel meter-health">
          <div className="panel-heading">
            <div>
              <h2>Zählerstatus</h2>
              <p>{typeLabels[type]} im Überblick</p>
            </div>
            <Gauge size={18} />
          </div>
          <div className="health-total">
            <strong>{data.meters}</strong>
            <span>Zähler insgesamt</span>
          </div>
          <div className="health-track">
            <span
              style={{
                width: `${data.meters ? (data.active / data.meters) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="health-row">
            <span>
              <i className="dot green" /> Aktiv
            </span>
            <strong>{data.active}</strong>
          </div>
          <div className="health-row">
            <span>
              <i className="dot orange" /> Offline
            </span>
            <strong>{data.offline}</strong>
          </div>
          <div className="health-row">
            <span>
              <i className="dot gray" /> In Wartung
            </span>
            <strong>{data.meters - data.active - data.offline}</strong>
          </div>
          <Link className="panel-link" href={`/meters${suffix}`}>
            Zähler verwalten <ChevronRight size={16} />
          </Link>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Verbrauch nach Liegenschaft</h2>
              <p>Aktueller Monat · {typeLabels[type]}</p>
            </div>
            <Link className="text-link" href={`/properties${suffix}`}>
              Alle ansehen <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="property-bars">
            {data.properties.length ? (
              data.properties.map((p) => (
                <div key={p.name} className="property-bar-row">
                  <span className="property-icon">
                    <Building2 size={20} />
                  </span>
                  <div className="property-bar-main">
                    <div>
                      <strong>{p.name}</strong>
                      <span>
                        {number(p.value)} <small>{data.unit}</small>
                      </span>
                    </div>
                    <small>
                      {p.city} · {p.meters} Zähler
                    </small>
                    <div className="bar-track">
                      <span style={{ width: `${(p.value / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p>Noch keine freigegebenen Zähler vorhanden.</p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                Offene Alarme{" "}
                <span className="count-badge">{data.alarmCount}</span>
              </h2>
              <p>Alle Zählerarten · Handlungsbedarf</p>
            </div>
            <Bell size={18} />
          </div>
          <div className="alarm-list">
            {data.alarms.length ? (
              data.alarms.map((alarm) => (
                <Link
                  href={`/alarms${suffix}`}
                  key={alarm.id}
                  className="alarm-item"
                >
                  <span
                    className={`alarm-symbol ${alarm.severity === "HIGH" ? "danger" : ""}`}
                  >
                    <Radio size={17} />
                  </span>
                  <div>
                    <strong>{alarm.title}</strong>
                    <small>
                      {alarm.meter.serialNumber} ·{" "}
                      {typeLabels[alarm.meter.type]}
                    </small>
                  </div>
                  <ChevronRight size={14} />
                </Link>
              ))
            ) : (
              <p className="muted">Keine offenen Alarme.</p>
            )}
          </div>
          <Link className="panel-link" href={`/alarms${suffix}`}>
            Alle Alarme ansehen <ChevronRight size={16} />
          </Link>
        </section>
      </div>
      <section className="panel types-summary">
        <div>
          <h2>Verbrauch nach Zählerart</h2>
          <p>Aktueller Monat · Einheiten separat ausgewiesen</p>
        </div>
        {data.typeTotals.map((item) => (
          <Link href={`/dashboard${suffix}&type=${item.type}`} key={item.type}>
            <span>{typeLabels[item.type]}</span>
            <strong>
              {number(item.value)}{" "}
              <small>
                {["GAS", "WATER"].includes(item.type) ? "m³" : "kWh"}
              </small>
            </strong>
          </Link>
        ))}
      </section>
      <p className="data-note">
        Demo-Messwerte · Ungültige Werte sind ausgeschlossen. Der heutige Tag
        ist noch unvollständig. Kosten dienen der Orientierung und sind keine
        Abrechnung.
      </p>
    </>
  );
}
