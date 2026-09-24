"use client";
import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
export function AddendumForm({
  workOrderId,
  tenantId,
}: {
  workOrderId: string;
  tenantId: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/work-orders/${workOrderId}/addenda?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.get("title"),
            description: form.get("description"),
            reason: form.get("reason"),
            estimatedMinutes: Number(form.get("estimatedMinutes")) || null,
            material: [],
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("Nachtrag gespeichert.");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="grid gap-3 rounded border p-4" onSubmit={submit}>
      <label>
        Titel
        <input name="title" required maxLength={200} />
      </label>
      <label>
        Beschreibung
        <textarea name="description" required maxLength={6000} />
      </label>
      <label>
        Grund
        <textarea name="reason" required maxLength={2000} />
      </label>
      <label>
        Geschätzter Aufwand (Minuten)
        <input name="estimatedMinutes" type="number" min="1" max="100000" />
      </label>
      <Button disabled={busy} type="submit">
        Nachtrag anfordern
      </Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
