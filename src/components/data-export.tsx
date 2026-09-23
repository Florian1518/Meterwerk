"use client";
import { useState } from "react";
import { Button } from "./ui/button";

export function DataExport({ tenantId }: { tenantId: string }) {
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const iso = (value: string) =>
    value && !Number.isNaN(new Date(`${value}Z`).valueOf())
      ? new Date(`${value}Z`).toISOString()
      : "";
  return (
    <section className="panel space-y-4">
      <h2>Messwerte als CSV exportieren</h2>
      <p>
        Zeitraum in UTC, Beginn einschließlich, Ende ausschließlich. Ohne
        Zähler- oder Liegenschafts-ID werden alle freigegebenen Messwerte
        exportiert. Dezimalwerte verwenden einen Punkt.
      </p>
      <form
        action="/api/data-management/export"
        method="get"
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          setError("");
          if (!(new Date(iso(from)) < new Date(iso(to)))) {
            event.preventDefault();
            setError("Beginn muss vor dem Ende liegen.");
          }
        }}
      >
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="from" value={iso(from)} />
        <input type="hidden" name="to" value={iso(to)} />
        <label className="field">
          Von (UTC)
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            required
          />
        </label>
        <label className="field">
          Bis exklusiv (UTC)
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            required
          />
        </label>
        <label className="field">
          Zähler-ID (optional)
          <input name="meterId" maxLength={160} />
        </label>
        <label className="field">
          Liegenschafts-ID (optional)
          <input name="propertyId" maxLength={160} />
        </label>
        <label className="field">
          Medium
          <select name="medium">
            <option value="">Alle Medien</option>
            <option value="ELECTRICITY">Strom</option>
            <option value="WATER">Wasser</option>
            <option value="GAS">Gas</option>
            <option value="HEAT">Wärme</option>
          </select>
        </label>
        <Button type="submit">CSV herunterladen</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p className="muted">
        Ein leerer Export enthält nur die Kopfzeile. Bei einem Zugriffs- oder
        Datenbankfehler zeigt der Download eine API-Fehlermeldung.
      </p>
    </section>
  );
}
