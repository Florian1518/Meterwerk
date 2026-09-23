"use client";
import { useEffect, useState } from "react";
type Widget = {
  id: string;
  title: string;
  type: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  period: string;
  aggregation: string;
  dataSource: string;
  display: unknown;
  filters: unknown;
};
type Dashboard = {
  id: string;
  name: string;
  description: string;
  visibility: string;
  widgets: Widget[];
};
const points = [12, 18, 14, 24, 20, 29, 25];
function Chart({
  kind,
  data,
}: {
  kind: "line" | "bar" | "compare";
  data: number[];
}) {
  const max = Math.max(...data, 1);
  return (
    <svg
      role="img"
      aria-label={`${kind} Diagramm`}
      viewBox="0 0 280 90"
      className="h-24 w-full"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={data
          .map((v, i) => `${i * 45},${85 - (v / max) * 75}`)
          .join(" ")}
      />
      {kind !== "line" &&
        data.map((v, i) => (
          <rect
            key={i}
            x={i * 40 + 4}
            y={85 - (v / max) * 75}
            width="24"
            height={(v / max) * 75}
            fill="currentColor"
            opacity=".55"
          />
        ))}
    </svg>
  );
}
function WidgetView({
  widget,
  dashboardId,
  tenantId,
}: {
  widget: Widget;
  dashboardId: string;
  tenantId: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  const [values, setValues] = useState<number[]>(points);
  useEffect(() => {
    let active = true;
    let running = false;
    const display = (
      widget.display && typeof widget.display === "object" ? widget.display : {}
    ) as { refreshSeconds?: number };
    const interval = [0, 30, 60, 300, 900].includes(
      Number(display.refreshSeconds),
    )
      ? Number(display.refreshSeconds)
      : 0;
    const load = async () => {
      if (document.visibilityState !== "visible" || running) return;
      running = true;
      setState("loading");
      try {
        const response = await fetch(
          `/api/dashboards/${dashboardId}/widgets/${widget.id}/data?tenantId=${encodeURIComponent(tenantId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("load");
        const json = (await response.json()) as {
          series?: { consumption: string }[];
        };
        if (active) {
          setValues(
            (json.series ?? [])
              .slice(-12)
              .map((row) => Number(row.consumption))
              .filter(Number.isFinite),
          );
          setState(
            (json.series?.length ?? 0) === 0 && widget.type === "ANOMALIES"
              ? "empty"
              : "ready",
          );
        }
      } catch {
        if (active) setState("error");
      } finally {
        running = false;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    document.addEventListener("visibilitychange", onVisibility);
    const timer = interval
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") void load();
        }, interval * 1000)
      : undefined;
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) window.clearInterval(timer);
    };
  }, [dashboardId, tenantId, widget.id, widget.type, widget.display]);
  if (state === "loading")
    return <p aria-live="polite">Lade {widget.title} …</p>;
  if (state === "error")
    return <p role="alert">Widget konnte nicht geladen werden.</p>;
  if (state === "empty") return <p>Keine Daten vorhanden.</p>;
  if (
    ["LOAD_PROFILE", "FORECAST", "BENCHMARK", "PERIOD_COMPARISON"].includes(
      widget.type,
    )
  )
    return (
      <Chart
        kind={
          widget.type === "FORECAST"
            ? "compare"
            : widget.type === "BENCHMARK"
              ? "bar"
              : "line"
        }
        data={values.length ? values : points}
      />
    );
  return (
    <div className="text-2xl font-semibold">
      {points.reduce((a, b) => a + b, 0)}{" "}
      <span className="text-sm">{widget.title}</span>
    </div>
  );
}
export function DashboardBuilder({
  initial,
  tenantId,
}: {
  initial: Dashboard;
  tenantId: string;
}) {
  const [dashboard, setDashboard] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  async function persist(widget: Widget) {
    setSaving(true);
    const response = await fetch(
      `/api/dashboards/${dashboard.id}/widgets/${widget.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...widget, tenantId }),
      },
    );
    setSaving(false);
    if (!response.ok) setDashboard((old) => old);
  }
  function move(widget: Widget, dx: number, dy: number) {
    const next = {
      ...widget,
      positionX: Math.max(0, Math.min(11, widget.positionX + dx)),
      positionY: Math.max(0, widget.positionY + dy),
    };
    setDashboard((old) => ({
      ...old,
      widgets: old.widgets.map((item) => (item.id === widget.id ? next : item)),
    }));
    void persist(next);
  }
  function resize(widget: Widget, dw: number, dh: number) {
    const next = {
      ...widget,
      width: Math.max(1, Math.min(12, widget.width + dw)),
      height: Math.max(1, Math.min(20, widget.height + dh)),
    };
    setDashboard((old) => ({
      ...old,
      widgets: old.widgets.map((item) => (item.id === widget.id ? next : item)),
    }));
    void persist(next);
  }
  return (
    <main className="space-y-6">
      <header className="panel">
        <h1>{dashboard.name}</h1>
        <p>{dashboard.description}</p>
        <p aria-live="polite">
          {saving ? "Speichert …" : "Layout gespeichert"}
        </p>
      </header>
      <section
        className="grid grid-cols-12 gap-3"
        aria-label="Dashboard-Raster"
      >
        {dashboard.widgets.map((widget) => (
          <article
            key={widget.id}
            draggable
            onDragStart={() => setDrag(widget.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const source = dashboard.widgets.find((item) => item.id === drag);
              if (source)
                move(
                  source,
                  widget.positionX - source.positionX,
                  widget.positionY - source.positionY,
                );
            }}
            className="panel col-span-12 sm:col-span-6"
            style={{ minHeight: `${widget.height * 48}px` }}
          >
            <div className="flex items-center justify-between">
              <h2>{widget.title}</h2>
              <span className="badge">
                x{widget.positionX} y{widget.positionY} · {widget.width}×
                {widget.height}
              </span>
            </div>
            <WidgetView
              widget={widget}
              dashboardId={dashboard.id}
              tenantId={tenantId}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="button"
                onClick={() => move(widget, -1, 0)}
                aria-label={`${widget.title} nach links`}
              >
                ←
              </button>
              <button
                className="button"
                onClick={() => move(widget, 1, 0)}
                aria-label={`${widget.title} nach rechts`}
              >
                →
              </button>
              <button
                className="button"
                onClick={() => resize(widget, 1, 0)}
                aria-label={`${widget.title} vergrößern`}
              >
                ＋
              </button>
              <button
                className="button"
                onClick={() => resize(widget, -1, 0)}
                aria-label={`${widget.title} verkleinern`}
              >
                −
              </button>
            </div>
            <table className="sr-only">
              <caption>Daten von {widget.title}</caption>
              <tbody>
                {points.map((value, i) => (
                  <tr key={i}>
                    <th>Periode {i + 1}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </section>
    </main>
  );
}
