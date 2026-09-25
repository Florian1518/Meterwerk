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
  async function action(body: object) {
    const response = await fetch("/api/platform/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Aktion fehlgeschlagen");
    const result = await response.json();
    setScenario(result.scenario ?? scenario);
    setMessage("Gespeichert");
  }
  return (
    <section className="panel">
      <h2>Demo-Szenario</h2>
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
