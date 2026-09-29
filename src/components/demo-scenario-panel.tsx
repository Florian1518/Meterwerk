"use client";
import { useState } from "react";
const DEMO_SCENARIOS = [
  "NORMAL",
  "HIGH_ELECTRICITY",
  "WATER_LEAK",
  "METER_OFFLINE",
  "GATEWAY_OFFLINE",
  "MISSING_DATA",
  "OPEN_ALARM",
  "ACKNOWLEDGED_ALARM",
  "CRITICAL_ANOMALY",
  "MAINTENANCE",
  "METER_REPLACEMENT",
  "SUPPORT_CASE",
  "FIRMWARE_ROLLOUT",
];
export function DemoScenarioPanel({ initial }: { initial: string }) {
  const [scenario, setScenario] = useState(initial);
  const [message, setMessage] = useState("");
  const [tenantId, setTenantId] = useState("");
  async function action(body: object) {
    try {
      const response = await fetch("/api/platform/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, tenantId }),
      });
      if (!response.ok) throw new Error("Aktion fehlgeschlagen");
      const result = await response.json();
      setScenario(result.scenario ?? scenario);
      setMessage("Gespeichert");
    } catch {
      setMessage(
        "Aktion fehlgeschlagen. Bitte Demo-Mandant und Umgebung prüfen.",
      );
    }
  }
  return (
    <section className="panel">
      <h2>Demo-Szenario</h2>
      <label htmlFor="demo-tenant">Demo-Mandant</label>
      <select
        id="demo-tenant"
        value={tenantId}
        onChange={(event) => setTenantId(event.target.value)}
      >
        <option value="">Bitte auswählen</option>
        <option value="demo-tenant-0">Nordstern Demo</option>
        <option value="demo-tenant-1">Rheinblick Demo</option>
      </select>
      <p>Nur in DEMO/TEST aktivierbar. Jede Änderung wird auditiert.</p>
      <label htmlFor="demo-scenario">Szenario</label>
      <select
        id="demo-scenario"
        value={scenario}
        onChange={(event) => setScenario(event.target.value)}
      >
        {DEMO_SCENARIOS.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <div className="button-row">
        <button
          type="button"
          onClick={() => void action({ action: "scenario", scenario })}
        >
          Aktivieren
        </button>
        <button type="button" onClick={() => void action({ action: "reset" })}>
          NORMAL zurücksetzen
        </button>
        <button
          type="button"
          onClick={() => void action({ action: "refresh" })}
        >
          Demo-Daten aktualisieren
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
