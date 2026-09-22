"use client";
import { utcInput } from "@/lib/format";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function MeterReplacementForm({
  oldMeterId,
  tenantId,
}: {
  oldMeterId: string;
  tenantId: string;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !window.confirm(
        "Zählerwechsel speichern? Der Ausbauzeitpunkt und Zählerstände werden dauerhaft dokumentiert.",
      )
    )
      return;
    setPending(true);
    const data = new FormData(event.currentTarget);
    const payload = {
      oldMeterId,
      newMeterId: String(data.get("newMeterId")),
      removedAt: utcInput(String(data.get("removedAt"))),
      removedRegister: String(data.get("removedRegister")),
      installedAt: utcInput(String(data.get("installedAt"))),
      installedRegister: String(data.get("installedRegister")),
      reason: String(data.get("reason")),
      documentation: String(data.get("documentation") || ""),
    };
    try {
      const response = await fetch(
        `/api/meters/replacement?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      setMessage(
        response.ok
          ? "Zählerwechsel gespeichert."
          : (result.error ?? "Speichern fehlgeschlagen."),
      );
    } catch {
      setMessage("Verbindung fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel">
      <h2>Zählerwechsel</h2>
      <p>
        Historische Messwerte bleiben erhalten. Der neue Zähler muss dasselbe
        Medium und dieselbe Einheit haben.
      </p>
      {message && (
        <p
          role="status"
          className={message.includes("gespeichert") ? "toast" : "form-error"}
        >
          {message}
        </p>
      )}
      <form className="form-grid" onSubmit={submit}>
        <label>
          Neuer Zähler (ID)
          <input required name="newMeterId" />
        </label>
        <label>
          Ausbau (UTC)
          <input required type="datetime-local" name="removedAt" />
        </label>
        <label>
          Ausbauzählerstand
          <input required name="removedRegister" inputMode="decimal" />
        </label>
        <label>
          Einbau (UTC)
          <input required type="datetime-local" name="installedAt" />
        </label>
        <label>
          Einbauzählerstand
          <input required name="installedRegister" inputMode="decimal" />
        </label>
        <label>
          Grund
          <input required name="reason" maxLength={240} />
        </label>
        <label>
          Dokumentation
          <textarea name="documentation" maxLength={2000} />
        </label>
        <Button type="submit" disabled={pending}>
          Wechsel speichern
        </Button>
      </form>
    </section>
  );
}
