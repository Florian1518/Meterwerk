"use client";
import { dateTime, decimal } from "@/lib/format";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import type { systemStatus } from "@/server/system-status";
type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
type Status = Serialized<Awaited<ReturnType<typeof systemStatus>>>;
type Credential = {
  id: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  keyFingerprint: string | null;
};
export function SystemConsole({
  initial,
  timeZone = "Europe/Berlin",
}: {
  initial: Status;
  timeZone?: string;
}) {
  const stamp = (value?: string | null) =>
    value ? dateTime(value, timeZone) : "Noch keine Daten";
  const [data, setData] = useState(initial),
    [error, setError] = useState(""),
    [gateway, setGateway] = useState(initial.gateways[0]?.id ?? ""),
    [credentials, setCredentials] = useState<Credential[]>([]),
    [secret, setSecret] = useState(""),
    [expires, setExpires] = useState("");
  const suffix = `?tenantId=${encodeURIComponent(initial.tenantId)}`;
  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch(`/api/system/health${suffix}`, {
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(
            "Systemstatus nicht erreichbar; Daten sind veraltet.",
          );
        setData(await response.json());
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [suffix]);
  useEffect(() => {
    if (!gateway) return;
    void fetch(`/api/gateways/${gateway}/credentials${suffix}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Credentials nicht verfügbar");
        setCredentials(await r.json());
      })
      .catch((e) => setError(e.message));
  }, [gateway, suffix]);
  async function command(operation: string, credentialId?: string) {
    setSecret("");
    try {
      const response = await fetch(
        `/api/gateways/${gateway}/credentials${suffix}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation,
            ...(credentialId ? { credentialId } : {}),
            ...(operation !== "REVOKE" && expires
              ? { expiresAt: new Date(expires).toISOString() }
              : {}),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.privateKey)
        setSecret(
          JSON.stringify(
            { credentialId: result.id, privateKey: result.privateKey },
            null,
            2,
          ),
        );
      const list = await fetch(`/api/gateways/${gateway}/credentials${suffix}`);
      if (list.ok) setCredentials(await list.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          try {
            const r = await fetch(`/api/gateways${suffix}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: form.get("name"),
                externalGatewayId: form.get("externalGatewayId"),
              }),
            });
            const value = await r.json();
            if (!r.ok) throw new Error(value.error);
            const status = await fetch(`/api/system/health${suffix}`);
            if (!status.ok)
              throw new Error("Gateway erstellt; Status bitte erneut laden.");
            setData(await status.json());
            setGateway(value.id);
            setSecret("");
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        <label>
          Gateway-Name
          <input required name="name" className="block rounded border p-2" />
        </label>
        <label>
          Standort-Kennung
          <input
            required
            name="externalGatewayId"
            pattern="[A-Za-z0-9_-]{1,80}"
            className="block rounded border p-2"
          />
        </label>
        <Button type="submit">Gateway anlegen</Button>
      </form>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <p>
        Stand: {stamp(data.asOf)} · {timeZone} · Aktualisierung alle 5 Sekunden
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["PostgreSQL", data.postgres],
          ["MQTT", data.mqtt],
          ["Ingestion", data.ingestion],
        ].map(([label, ok]) => (
          <div className="rounded border bg-white p-4" key={String(label)}>
            <strong>{label}</strong>
            <p>
              {error
                ? "Status unbekannt / veraltet"
                : ok
                  ? "Erreichbar / aktiv"
                  : "Nicht erreichbar / veraltet"}
            </p>
          </div>
        ))}
      </div>
      <h2>Gateways</h2>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Gateways, horizontal scrollbar"
      >
        <table className="w-full text-left">
          <thead>
            <tr>
              {[
                "Gateway",
                "Status",
                `Heartbeat (${timeZone})`,
                "Version",
                "Queue",
                "Quarantäne / verworfen",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.gateways.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>
                  {g.status}
                  {g.queueWarning ? " · Queue-Warnung" : ""}
                </td>
                <td>{stamp(g.lastSeenAt)}</td>
                <td>{g.firmwareVersion ?? "Unbekannt"}</td>
                <td>{g.queueSize}</td>
                <td>
                  {g.quarantineSize} / {g.queueDropped}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Geräte</h2>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Geräte, horizontal scrollbar"
      >
        <table className="w-full text-left">
          <thead>
            <tr>
              {[
                "Gerät",
                "Status",
                `Letzter erfolgreicher Poll (${timeZone})`,
                `Letzte Messung (${timeZone})`,
                "Fehlerrate",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.devices.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.model} · {d.id}
                </td>
                <td>{d.status}</td>
                <td>{stamp(d.diagnostic?.lastSuccessAt ?? d.lastSeenAt)}</td>
                <td>{stamp(d.telemetry[0]?.timestamp)}</td>
                <td>
                  {d.diagnostic
                    ? `${decimal((100 * d.diagnostic.errors) / Math.max(1, d.diagnostic.errors + d.diagnostic.successes), 1)} % (${d.diagnostic.errors} Fehler)`
                    : "Keine Diagnose"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Offene technische Alarme</h2>
      {data.alerts.length ? (
        <ul>
          {data.alerts.map((a) => (
            <li key={a.id}>
              {a.kind} · {a.entityId} · seit {stamp(a.openedAt)} · Auftreten{" "}
              {a.occurrences}
            </li>
          ))}
        </ul>
      ) : (
        <p>Keine offenen technischen Alarme.</p>
      )}
      <h2>Gateway-Credentials</h2>
      <label>
        Gateway
        <select
          className="block rounded border p-2"
          value={gateway}
          onChange={(e) => {
            setSecret("");
            setCredentials([]);
            setGateway(e.target.value);
          }}
        >
          {data.gateways.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ablaufdatum (optional, lokale Eingabezeit)
        <input
          className="block rounded border p-2"
          type="datetime-local"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
        />
      </label>
      <Button disabled={!gateway} onClick={() => void command("CREATE")}>
        Credential erstellen
      </Button>
      <p>
        Rotation widerruft den bisherigen Schlüssel sofort. Neuen Schlüssel
        einmalig sichern und am Gateway hinterlegen; anschließend Agent neu
        starten.
      </p>
      {secret && (
        <div role="status">
          <p>Nur einmal verfügbar. Nicht in Logs oder Tickets kopieren.</p>
          <textarea
            aria-label="Einmaliger Gateway-Schlüssel"
            readOnly
            value={secret}
            className="h-48 w-full rounded border p-2"
          />
          <Button onClick={() => setSecret("")}>Anzeige schließen</Button>
        </div>
      )}
      <ul>
        {credentials.map((c) => (
          <li className="my-4 rounded border p-3" key={c.id}>
            <p>
              {c.id} ·{" "}
              {c.status === "ACTIVE" &&
              c.expiresAt &&
              Date.parse(c.expiresAt) < Date.parse(data.asOf)
                ? "EXPIRED"
                : c.status}
            </p>
            <p>
              Erstellt: {stamp(c.createdAt)} · Genutzt:{" "}
              {c.lastUsedAt ? stamp(c.lastUsedAt) : "Nie"} · Ablauf:{" "}
              {c.expiresAt ? stamp(c.expiresAt) : "Keiner"} · Widerruf:{" "}
              {c.revokedAt ? stamp(c.revokedAt) : "Keiner"}
            </p>
            <p>SHA-256: {c.keyFingerprint ?? "Bestandscredential"}</p>
            {c.status === "ACTIVE" && (
              <>
                <Button onClick={() => void command("ROTATE", c.id)}>
                  Rotieren
                </Button>{" "}
                <Button onClick={() => void command("REVOKE", c.id)}>
                  Widerrufen
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
