"use client";
import { dateTime } from "@/lib/format";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import {
  defaultConfig,
  profiles,
  metricSchema,
  type ModbusConfig,
} from "@/lib/modbus/contracts";
import type { readModbus } from "@/server/modbus";
type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
export type ModbusView = Serialized<Awaited<ReturnType<typeof readModbus>>>;

export function ModbusConsole({
  initial,
  diagnosis = false,
  timeZone = "Europe/Berlin",
}: {
  initial: ModbusView;
  diagnosis?: boolean;
  timeZone?: string;
}) {
  const stamp = (v?: string | null) =>
    v ? dateTime(v, timeZone) : "Noch keine Daten";
  const [data, setData] = useState(initial);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const first = initial.devices[0];
  const saved = first?.modbusConfig?.configuration as ModbusConfig | undefined;
  const [connection, setConnection] = useState(saved?.interface ?? "TCP");
  const [profileId, setProfileId] = useState(
    saved?.profileId ?? defaultConfig.profileId,
  );
  const suffix = `tenantId=${encodeURIComponent(initial.tenantId)}`;
  const endpoint = `/api/meters/${encodeURIComponent(initial.meter.id)}/modbus?${suffix}${diagnosis && initial.canManage ? "&debug=true" : ""}`;
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Daten nicht verfügbar");
      setData(value);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Verbindung fehlgeschlagen",
      );
    }
  }, [endpoint]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function action(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Aktion fehlgeschlagen");
      setMessage(value.message);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Aktion fehlgeschlagen",
      );
    } finally {
      setBusy(false);
    }
  }
  function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const n = (key: string) => Number(form.get(key));
    const s = (key: string) => String(form.get(key) ?? "");
    const common = {
      profileId,
      pollingIntervalMs: n("pollingIntervalMs"),
      timeoutMs: n("timeoutMs"),
    };
    const configuration =
      connection === "TCP"
        ? {
            ...common,
            interface: "TCP",
            host: s("host"),
            port: n("port"),
            unitId: n("unitId"),
          }
        : {
            ...common,
            interface: "RTU",
            comPort: s("comPort"),
            baudRate: n("baudRate"),
            dataBits: n("dataBits"),
            stopBits: n("stopBits"),
            parity: s("parity"),
            slaveId: n("slaveId"),
          };
    void action({
      operation: "CONFIGURE",
      gatewayId: s("gatewayId"),
      configuration,
    });
  }
  const device = data.devices[0];
  const diagnostic = device?.diagnostic;
  const config = device?.modbusConfig;
  const activeConnection = config?.configuration as ModbusConfig | undefined;
  const sample = device?.telemetry[0];
  const current = sample?.revision === config?.revision;
  const stale =
    !sample ||
    Date.parse(data.asOf) - Date.parse(sample.timestamp) >
      Math.max(15000, (activeConnection?.pollingIntervalMs ?? 5000) * 3);
  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const q = new URLSearchParams({
        tenantId: data.tenantId,
        from: new Date(`${form.get("from")}:00Z`).toISOString(),
        to: new Date(`${form.get("to")}:00Z`).toISOString(),
        metric: String(form.get("metric")),
      });
      const response = await fetch(`/api/meters/${data.meter.id}/export?${q}`);
      if (!response.ok)
        throw new Error(
          (await response.json()).error ?? "Export fehlgeschlagen",
        );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "meterwerk-readings.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Export fehlgeschlagen",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded border p-3">
          {message}
        </p>
      )}
      <section className="panel p-5">
        <h2>Technische Live-Werte</h2>
        <p>
          Automatische Aktualisierung alle 5 Sekunden · Anzeigezeitzone{" "}
          {timeZone}
        </p>
        <p>
          Gerät: <strong>{device?.status ?? "NOT_CONFIGURED"}</strong> ·
          Inbetriebnahme: <strong>{config?.state ?? "NOT_CONFIGURED"}</strong> ·
          Letzte Messung: {stamp(sample?.timestamp)}
        </p>
        {(stale || !current) && sample && (
          <p role="status">
            Die angezeigten Werte sind veraltet oder stammen aus einer früheren
            Konfiguration.
          </p>
        )}
        {!sample ? (
          <p>
            Noch keine technischen Messwerte. Verbindung testen und einmalig
            lesen.
          </p>
        ) : (
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Messgrößen, horizontal scrollbar"
          >
            <table className="w-full text-left">
              <caption className="sr-only">
                Technische Messwerte mit Einheiten
              </caption>
              <thead>
                <tr>
                  <th>Messgröße</th>
                  <th>Wert</th>
                  <th>Einheit</th>
                </tr>
              </thead>
              <tbody>
                {sample.measurements.map((m) => (
                  <tr key={m.metric}>
                    <td>
                      {profiles[0].registers.find((r) => r.metric === m.metric)
                        ?.description ?? m.metric}
                    </td>
                    <td>{m.value}</td>
                    <td>{m.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!diagnosis && (
          <Link
            className="text-link"
            href={`/meters/${initial.meter.id}/modbus?${suffix}`}
          >
            Modbus-Diagnose und Inbetriebnahme öffnen
          </Link>
        )}
      </section>
      {diagnosis && (
        <section className="panel p-5">
          <h2>Technische Diagnose</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt>Letzter erfolgreicher Poll ({timeZone})</dt>
              <dd>{stamp(diagnostic?.lastSuccessAt)}</dd>
            </div>
            <div>
              <dt>Letzter Poll ({timeZone})</dt>
              <dd>{stamp(diagnostic?.lastPollAt)}</dd>
            </div>
            <div>
              <dt>Antwortzeit</dt>
              <dd>
                {diagnostic?.responseMs === null ||
                diagnostic?.responseMs === undefined
                  ? "—"
                  : `${diagnostic.responseMs} ms`}
              </dd>
            </div>
            <div>
              <dt>Letzter Fehler</dt>
              <dd>{diagnostic?.lastError ?? "Kein Fehler gemeldet"}</dd>
            </div>
            <div>
              <dt>Erfolgreiche Reads / Fehler</dt>
              <dd>
                {diagnostic?.successes ?? 0} / {diagnostic?.errors ?? 0}
              </dd>
            </div>
            <div>
              <dt>Polling</dt>
              <dd>
                {config?.pollingEnabled ? "Gestartet" : "Gestoppt"} ·{" "}
                {activeConnection?.pollingIntervalMs ?? "—"} ms
              </dd>
            </div>
            <div>
              <dt>COM-Port / Host</dt>
              <dd>
                {activeConnection?.interface === "TCP"
                  ? `${activeConnection.host}:${activeConnection.port}`
                  : (activeConnection?.comPort ?? "—")}
              </dd>
            </div>
            <div>
              <dt>Slave-ID / Unit-ID</dt>
              <dd>
                {activeConnection?.interface === "TCP"
                  ? activeConnection.unitId
                  : (activeConnection?.slaveId ?? "—")}
              </dd>
            </div>
            <div>
              <dt>Baudrate</dt>
              <dd>
                {activeConnection?.interface === "RTU"
                  ? activeConnection.baudRate
                  : "Nicht zutreffend (TCP)"}
              </dd>
            </div>
            <div>
              <dt>Profil / Revision</dt>
              <dd>
                {activeConnection?.profileId ?? "—"} / {config?.revision ?? "—"}
              </dd>
            </div>
          </dl>
          {data.canManage && (
            <div className="my-4 flex flex-wrap gap-2">
              {(
                [
                  ["TEST", "Verbindung testen"],
                  ["READ", "Einmalig lesen"],
                  ["START", "Polling starten"],
                  ["STOP", "Polling stoppen"],
                ] as const
              ).map(([command, label]) => (
                <Button
                  key={command}
                  disabled={busy || !config}
                  onClick={() =>
                    void action({ operation: "COMMAND", action: command })
                  }
                >
                  {label}
                </Button>
              ))}
              <Button
                variant="outline"
                disabled={busy || !config}
                onClick={() => void action({ operation: "DISABLE" })}
              >
                Gerät deaktivieren
              </Button>
            </div>
          )}
          <p>
            Aktionen werden vom Gateway ausgeführt. PENDING bedeutet noch nicht
            ausgeführt; EXPIRED bedeutet keine Bestätigung innerhalb von 60
            Sekunden.
          </p>
          <ul>
            {device?.commands.map((c) => (
              <li key={c.id}>
                {c.action}: {c.status}
                {c.error ? ` (${c.error})` : ""} · {stamp(c.createdAt)}
              </li>
            ))}
          </ul>
          {data.canManage && (
            <details className="mt-4">
              <summary>
                Administrator-Debug: letzte Rohwerte (maximal 32 Register)
              </summary>
              <p>Zeitstempel: {stamp(diagnostic?.lastPollAt)}</p>
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Diagnosewerte, horizontal scrollbar"
              >
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th>Register</th>
                      <th>Rohwert (Hex)</th>
                      <th>Dekodierter Wert</th>
                      <th>Einheit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(diagnostic?.raw) &&
                      diagnostic.raw.map((r, index) => {
                        const row = r as {
                          register: number;
                          raw: string;
                          value: string;
                          unit: string;
                        };
                        return (
                          <tr key={index}>
                            <td>{row.register}</td>
                            <td>{row.raw}</td>
                            <td>{row.value}</td>
                            <td>{row.unit}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>
      )}
      {diagnosis && data.canManage && (
        <section className="panel p-5">
          <h2>Inbetriebnahme · Schritt {config?.step ?? 1} von 9</h2>
          <p>
            Ein geändertes Profil oder eine geänderte Schnittstelle erfordert
            eine erneute Messwertprüfung.
          </p>
          <form onSubmit={configure} className="grid gap-4 sm:grid-cols-2">
            <label>
              1 · Gateway auswählen
              <select
                name="gatewayId"
                required
                defaultValue={first?.gatewayId ?? ""}
              >
                <option value="">Bitte auswählen</option>
                {data.gateways.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.status})
                  </option>
                ))}
              </select>
            </label>
            <div>
              2 · Zähler: <strong>{data.meter.serialNumber}</strong>
              <br />
              <Link className="text-link" href={`/commissioning?${suffix}`}>
                Anderen Zähler auswählen / anlegen
              </Link>
            </div>
            <label>
              3 · Modbus-Profil
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.model}
                    {p.verified ? "" : " (Vorlage, Register noch offen)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              4 · Schnittstelle
              <select
                value={connection}
                onChange={(e) => setConnection(e.target.value as "TCP" | "RTU")}
              >
                <option>TCP</option>
                <option>RTU</option>
              </select>
            </label>
            {connection === "RTU" ? (
              <>
                <label>
                  4 · COM-Port am Gateway
                  <input
                    name="comPort"
                    required
                    placeholder="COM3 oder /dev/ttyUSB0"
                    defaultValue={
                      saved?.interface === "RTU" ? saved.comPort : ""
                    }
                  />
                </label>
                <label>
                  5 · Baudrate
                  <select
                    name="baudRate"
                    defaultValue={
                      saved?.interface === "RTU" ? saved.baudRate : 9600
                    }
                  >
                    {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(
                      (n) => (
                        <option key={n}>{n}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Data Bits
                  <select name="dataBits">
                    <option>8</option>
                  </select>
                </label>
                <label>
                  Stop Bits
                  <select
                    name="stopBits"
                    defaultValue={
                      saved?.interface === "RTU" ? saved.stopBits : 1
                    }
                  >
                    <option>1</option>
                    <option>2</option>
                  </select>
                </label>
                <label>
                  Parity
                  <select
                    name="parity"
                    defaultValue={
                      saved?.interface === "RTU" ? saved.parity : "even"
                    }
                  >
                    <option value="even">Even</option>
                    <option value="odd">Odd</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label>
                  5 · Slave-ID
                  <input
                    type="number"
                    min="1"
                    max="247"
                    name="slaveId"
                    required
                    defaultValue={
                      saved?.interface === "RTU" ? saved.slaveId : 1
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  4 · Host
                  <input
                    name="host"
                    required
                    defaultValue={
                      saved?.interface === "TCP" ? saved.host : "127.0.0.1"
                    }
                  />
                </label>
                <label>
                  TCP-Port
                  <input
                    type="number"
                    name="port"
                    min="1"
                    max="65535"
                    required
                    defaultValue={
                      saved?.interface === "TCP" ? saved.port : 1502
                    }
                  />
                </label>
                <label>
                  5 · Unit-ID
                  <input
                    type="number"
                    name="unitId"
                    min="1"
                    max="247"
                    required
                    defaultValue={saved?.interface === "TCP" ? saved.unitId : 1}
                  />
                </label>
              </>
            )}
            <label>
              Polling-Intervall (ms)
              <input
                name="pollingIntervalMs"
                type="number"
                min="1000"
                max="3600000"
                defaultValue={saved?.pollingIntervalMs ?? 5000}
                required
              />
            </label>
            <label>
              Timeout je Register (ms)
              <input
                name="timeoutMs"
                type="number"
                min="100"
                max="10000"
                defaultValue={saved?.timeoutMs ?? 1000}
                required
              />
            </label>
            <Button disabled={busy} type="submit">
              Konfiguration speichern · weiter zu Schritt 6
            </Button>
          </form>
          <ol className="my-4 list-inside list-decimal" start={6}>
            <li>
              Verbindung über die Diagnoseaktion „Verbindung testen“ prüfen.
            </li>
            <li>
              „Einmalig lesen“ ausführen und Einheiten, Phasen und Werte mit dem
              Zähler vergleichen.
            </li>
            <li>Nutzungseinheit bestätigen.</li>
            <li>Inbetriebnahme abschließen.</li>
          </ol>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || !config}
              onClick={() =>
                void action({ operation: "REVIEW", revision: config?.revision })
              }
            >
              7 · Messwerte geprüft
            </Button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action({
                  operation: "ASSIGN",
                  unitId: new FormData(e.currentTarget).get("unitId"),
                });
              }}
              className="flex flex-wrap gap-2"
            >
              <label>
                8 · Nutzungseinheit
                <select name="unitId" defaultValue={initial.meter.unitId}>
                  {data.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.building.name} · {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button disabled={busy || !config}>Zuordnung bestätigen</Button>
            </form>
            <Button
              disabled={busy || !config}
              onClick={() => void action({ operation: "COMPLETE" })}
            >
              9 · Inbetriebnahme abschließen
            </Button>
          </div>
        </section>
      )}
      <section className="panel p-5">
        <h2>Messwerte als CSV exportieren</h2>
        <p>
          Zähler: {data.meter.serialNumber} · UTC · von einschließlich / bis
          ausschließlich · maximal 31 Tage und 10.000 Werte.
        </p>
        <form className="flex flex-wrap gap-3" onSubmit={download}>
          <label>
            Von (UTC)
            <input
              type="datetime-local"
              name="from"
              required
              defaultValue={new Date(Date.parse(initial.asOf) - 3600000)
                .toISOString()
                .slice(0, 16)}
            />
          </label>
          <label>
            Bis (UTC)
            <input
              type="datetime-local"
              name="to"
              required
              defaultValue={initial.asOf.slice(0, 16)}
            />
          </label>
          <label>
            Messgröße
            <select name="metric">
              {[...metricSchema.options, "consumption"].map((m) => (
                <option key={m} value={m}>
                  {profiles[0].registers.find((r) => r.metric === m)
                    ?.description ?? "Intervallverbrauch"}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy}>CSV herunterladen</Button>
        </form>
      </section>
    </div>
  );
}
