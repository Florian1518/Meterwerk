"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

type Rule = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  trigger: string;
  priority: number;
  conditions: unknown;
  actions: unknown;
  createdAt: string;
  updatedAt: string;
  cooldownSeconds?: number;
  nextScheduledAt?: string | null;
  executions?: {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
  }[];
};
const triggerLabels: Record<string, string> = {
  READING_CREATED: "Neuer Messwert",
  ALARM_CREATED: "Alarm erstellt",
  ALARM_STATUS_CHANGED: "Alarmstatus geändert",
  METER_ONLINE: "Zähler online",
  METER_OFFLINE: "Zähler offline",
  GATEWAY_ONLINE: "Gateway online",
  GATEWAY_OFFLINE: "Gateway offline",
  SCHEDULED_CHECK: "Zeitgesteuerte Prüfung",
};
export function Rules({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: Rule[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function create(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const trigger = String(form.get("trigger"));
      const threshold = String(form.get("threshold")).trim();
      const medium = String(form.get("medium"));
      const conditions = threshold
        ? [
            {
              operator: "GREATER_THAN",
              field: "consumption",
              value: threshold,
            },
            ...(medium ? [{ operator: "MEDIUM_EQUALS", medium }] : []),
          ]
        : medium
          ? [{ operator: "MEDIUM_EQUALS", medium }]
          : [];
      const body = {
        tenantId,
        name: String(form.get("name")),
        description: String(form.get("description")),
        active: true,
        trigger,
        priority: Number(form.get("priority") ?? 100),
        conditions,
        actions: [
          {
            type: "CREATE_ALARM",
            title: String(form.get("alarmTitle")),
            severity: String(form.get("severity")),
          },
        ],
      };
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Regel konnte nicht gespeichert werden.");
      setMessage("Regel gespeichert.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Regel konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <form className="panel space-y-4" action={create}>
        <h2>Neue Regel</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field">
            Name
            <input name="name" maxLength={160} required />
          </label>
          <label className="field">
            Priorität
            <input
              name="priority"
              type="number"
              min="0"
              max="10000"
              defaultValue="100"
              required
            />
          </label>
          <label className="field sm:col-span-2">
            Beschreibung
            <textarea name="description" maxLength={2000} required />
          </label>
          <label className="field">
            Trigger
            <select name="trigger" defaultValue="READING_CREATED">
              {Object.entries(triggerLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Medium
            <select name="medium">
              <option value="">Alle Medien</option>
              <option value="WATER">Wasser</option>
              <option value="ELECTRICITY">Strom</option>
              <option value="GAS">Gas</option>
              <option value="HEAT">Wärme</option>
            </select>
          </label>
          <label className="field">
            Verbrauch größer als (optional)
            <input name="threshold" inputMode="decimal" />
          </label>
          <label className="field">
            Alarmtitel
            <input
              name="alarmTitle"
              defaultValue="Regelalarm"
              maxLength={160}
              required
            />
          </label>
          <label className="field">
            Schweregrad
            <select name="severity">
              <option>MEDIUM</option>
              <option>LOW</option>
              <option>HIGH</option>
            </select>
          </label>
        </div>
        <p className="muted">
          Bedingungen und Aktionen werden als feste Felder gespeichert und
          serverseitig validiert. Freie JavaScript-Ausdrücke sind nicht möglich.
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Speichert …" : "Regel speichern"}
        </Button>
        {message && <p role="status">{message}</p>}
      </form>
      <section className="panel space-y-4">
        <h2>Vorhandene Regeln</h2>
        <div className="overflow-auto">
          <table className="data-table">
            <caption>Tenantgebundene Regeln, nach Priorität sortiert</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Trigger</th>
                <th scope="col">Priorität</th>
                <th scope="col">Status</th>
                <th scope="col">Letzte Ausführung</th>
                <th scope="col">Cooldown / nächster Lauf</th>
                <th scope="col">Aktualisiert (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {initial.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <strong>{rule.name}</strong>
                    <br />
                    <span className="muted">{rule.description}</span>
                  </td>
                  <td>{triggerLabels[rule.trigger] ?? rule.trigger}</td>
                  <td>{rule.priority}</td>
                  <td>{rule.active ? "Aktiv" : "Inaktiv"}</td>
                  <td>{rule.executions?.[0]?.status ?? "—"}</td>
                  <td>
                    {rule.cooldownSeconds ? `${rule.cooldownSeconds}s` : "—"}
                    {rule.nextScheduledAt
                      ? ` / ${rule.nextScheduledAt.replace("T", " ")}`
                      : ""}
                  </td>
                  <td>{rule.updatedAt.replace("T", " ")}</td>
                </tr>
              ))}
              {!initial.length && (
                <tr>
                  <td colSpan={7}>Noch keine Regeln vorhanden.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
