"use client";
import { useState } from "react";
export function IncidentForm({ tenantId }: { tenantId?: string }) {
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body: Record<string, unknown> = Object.fromEntries(
      new FormData(e.currentTarget),
    );
    body.components = [];
    const response = await fetch(
      "/api/incidents" + (tenantId ? "?tenantId=" + tenantId : ""),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    setMessage(
      response.ok ? "Incident erstellt." : "Speichern fehlgeschlagen.",
    );
  }
  return (
    <form className="panel grid gap-3" onSubmit={submit}>
      <h2>Incident erstellen</h2>
      <label>
        Titel
        <input name="title" required />
      </label>
      <label>
        Beschreibung
        <textarea name="description" required />
      </label>
      <label>
        Severity
        <select name="severity" defaultValue="MAJOR">
          <option>INFO</option>
          <option>MINOR</option>
          <option>MAJOR</option>
          <option>CRITICAL</option>
        </select>
      </label>
      <label>
        Scope
        <select name="scope" defaultValue="TENANT">
          <option>PLATFORM</option>
          <option>TENANT</option>
          <option>SERVICE</option>
        </select>
      </label>
      <button type="submit">Erstellen</button>
      {message && <p>{message}</p>}
    </form>
  );
}
