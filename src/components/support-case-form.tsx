"use client";
import { useState } from "react";
export function SupportCaseForm({ tenantId }: { tenantId: string }) {
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const r = await fetch("/api/support?tenantId=" + tenantId, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(r.ok ? "Supportfall erstellt." : "Speichern fehlgeschlagen.");
  }
  return (
    <form className="panel grid gap-3" onSubmit={submit}>
      <h2>Supportfall erstellen</h2>
      <label>
        Titel
        <input name="title" required />
      </label>
      <label>
        Beschreibung
        <textarea name="description" required />
      </label>
      <label>
        Kategorie
        <select name="category" defaultValue="OTHER">
          <option>ACCESS</option>
          <option>DEVICE</option>
          <option>DATA</option>
          <option>FIELD_SERVICE</option>
          <option>OTHER</option>
        </select>
      </label>
      <label>
        Priorität
        <select name="priority" defaultValue="NORMAL">
          <option>LOW</option>
          <option>NORMAL</option>
          <option>HIGH</option>
          <option>URGENT</option>
        </select>
      </label>
      <button type="submit">Erstellen</button>
      {message && <p>{message}</p>}
    </form>
  );
}
