"use client";
import { dateTime, decimal } from "@/lib/format";
import { useEffect, useState } from "react";
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
    [credentials, setCredentials] = useState<Credential[]>([]);
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
  return (
    <div className="space-y-6">
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
      <p>
        Neue Gateway-Signaturidentitäten werden ausschließlich durch
        Registrierung eines vom Gateway erzeugten Public Keys verwaltet.
      </p>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
