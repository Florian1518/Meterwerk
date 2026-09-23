"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui/button";
import { DataExport } from "./data-export";
import Link from "next/link";

type Initial = {
  nextCursor: string | null;
  filters: {
    from: string;
    to: string;
    fromUtc: string;
    toUtc: string;
    meter: string;
    type: string;
    status: string;
  };
  meters: {
    id: string;
    serialNumber: string;
    type: string;
    measurementUnit: string;
    status: "OK" | "WARNING" | "ERROR";
  }[];
  findings: {
    id: string;
    type: string;
    status: "OK" | "WARNING" | "ERROR";
    description: string;
    detectedAt: string;
    acknowledgedAt: string | null;
    meter: {
      id: string;
      serialNumber: string;
      type: string;
      measurementUnit: string;
    };
    reading: null | {
      id: string;
      timestamp: string;
      registerValue: string;
      meterValue: string | null;
      consumption: string;
      measurementUnit: string;
      quality: string;
    };
  }[];
};
const issueLabels: Record<string, string> = {
  MISSING_READINGS: "Fehlende Messwerte",
  DUPLICATE_READINGS: "Doppelte Messwerte",
  TIMESTAMP_OUT_OF_RANGE: "Unplausibler Zeitstempel",
  NEGATIVE_CONSUMPTION: "Negativer Verbrauch",
  UNUSUAL_JUMP: "Ungewöhnlicher Sprung",
  COUNTER_ROLLBACK: "Zählerstand rückwärts",
  UNIT_MISMATCH: "Unpassende Einheit",
  ORPHANED_ASSIGNMENT: "Verwaiste Zuordnung",
  DATA_GAP: "Datenlücke",
};

export function DataQuality({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkStatus, setBulkStatus] = useState("SUSPECT");
  async function bulk(action: "ACKNOWLEDGE" | "SET_STATUS") {
    const findings = initial.findings.filter((finding) =>
      selected.includes(finding.id),
    );
    const ids =
      action === "ACKNOWLEDGE"
        ? findings.map((finding) => finding.id)
        : [
            ...new Set(
              findings.flatMap((finding) =>
                finding.reading ? [finding.reading.id] : [],
              ),
            ),
          ];
    if (!ids.length) {
      setMessage("Keine passenden Messwerte ausgewählt.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/data-quality/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          action,
          ids,
          status: bulkStatus,
          reason: bulkReason,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Sammelaktion fehlgeschlagen.");
      setMessage(`${body.affected} Datensätze bearbeitet.`);
      setSelected([]);
      setHistory({});
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Sammelaktion fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  const [history, setHistory] = useState<
    Record<
      string,
      {
        action: string;
        reason: string;
        createdAt: string;
        beforeData: unknown;
        afterData: unknown;
      }[]
    >
  >({});
  async function scan() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/data-quality/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          from: initial.filters.from,
          to: initial.filters.to,
          meter: initial.filters.meter || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Prüfung fehlgeschlagen.");
      setMessage(
        `${body.scannedMeters} Zähler und ${body.scannedReadings} Messwerte geprüft; ${body.activeFindings} offene Befunde.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Prüfung fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function correct(
    form: FormData,
    readingId: string,
    action: "CORRECT" | "REPLACE" | "MARK_INVALID",
  ) {
    setBusy(true);
    setMessage("");
    try {
      const payload: Record<string, string> = {
        action,
        reason: String(form.get("reason") ?? ""),
      };
      if (action !== "MARK_INVALID") {
        payload.timestamp = new Date(
          `${String(form.get("timestamp"))}Z`,
        ).toISOString();
        payload.registerValue = String(form.get("registerValue") ?? "");
        payload.consumption = String(form.get("consumption") ?? "");
        payload.measurementUnit = String(form.get("measurementUnit") ?? "");
      }
      const response = await fetch(
        `/api/data-quality/readings/${encodeURIComponent(readingId)}/correction`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, tenantId }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Korrektur fehlgeschlagen.");
      setMessage(
        "Änderung gespeichert. Der ursprüngliche Messwert ist in der Historie erhalten.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Korrektur fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory(readingId: string) {
    const response = await fetch(
      `/api/data-quality/readings/${encodeURIComponent(readingId)}/history?tenantId=${encodeURIComponent(tenantId)}`,
    );
    const rows = await response.json();
    if (response.ok)
      setHistory((current) => ({ ...current, [readingId]: rows }));
    else setMessage(rows.error ?? "Historie konnte nicht geladen werden.");
  }
  return (
    <section className="stack-lg">
      <form
        method="get"
        className="filter-bar"
        aria-label="Datenqualitätsfilter"
      >
        <input type="hidden" name="tenantId" value={tenantId} />
        <label>
          Von
          <input
            aria-label="Zeitraum von"
            type="date"
            name="from"
            defaultValue={initial.filters.from.slice(0, 10)}
          />
        </label>
        <label>
          Bis
          <input
            aria-label="Zeitraum bis"
            type="date"
            name="to"
            defaultValue={initial.filters.to.slice(0, 10)}
          />
        </label>
        <label>
          Zähler
          <input
            name="meter"
            defaultValue={initial.filters.meter}
            placeholder="Seriennummer oder ID"
          />
        </label>
        <label>
          Problemtyp
          <select name="type" defaultValue={initial.filters.type}>
            <option value="">Alle</option>
            {Object.entries(issueLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={initial.filters.status}>
            <option value="">Alle</option>
            <option value="OK">OK</option>
            <option value="WARNING">Warnung</option>
            <option value="ERROR">Fehler</option>
          </select>
        </label>
        <button className="button-secondary" type="submit">
          Filtern
        </button>
        <button
          className="button-primary"
          type="button"
          onClick={scan}
          disabled={busy}
        >
          {busy ? "Prüfe …" : "Jetzt prüfen"}
        </button>
      </form>
      <p className="muted">
        Prüfzeitraum:{" "}
        {new Intl.DateTimeFormat("de-DE", {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(new Date(initial.filters.fromUtc))}{" "}
        bis{" "}
        {new Intl.DateTimeFormat("de-DE", {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(new Date(initial.filters.toUtc))}{" "}
        (UTC)
      </p>
      {message && (
        <p role="status" aria-live="polite" className="notice">
          {message}
        </p>
      )}
      <section aria-labelledby="meter-quality-title">
        <h2 id="meter-quality-title">Zählerstatus</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Zähler</th>
                <th scope="col">Medium</th>
                <th scope="col">Einheit</th>
                <th scope="col">Datenqualität</th>
              </tr>
            </thead>
            <tbody>
              {initial.meters.map((meter) => (
                <tr key={meter.id}>
                  <th scope="row">{meter.serialNumber}</th>
                  <td>{meter.type}</td>
                  <td>{meter.measurementUnit}</td>
                  <td>
                    <span
                      className={`status-badge ${meter.status.toLowerCase()}`}
                    >
                      {meter.status === "OK"
                        ? "OK"
                        : meter.status === "WARNING"
                          ? "Warnung"
                          : "Fehler"}
                    </span>
                  </td>
                </tr>
              ))}
              {initial.meters.length === 0 && (
                <tr>
                  <td colSpan={4}>Keine Zähler für diese Filter gefunden.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="findings-title">
        <h2 id="findings-title">Befunde</h2>
        <div className="panel space-y-3">
          <p>
            {selected.length} Befunde ausgewählt (maximal 100). Eine Bestätigung
            dokumentiert die Kenntnisnahme; der Fehler bleibt sichtbar.
          </p>
          <label className="field">
            Begründung
            <textarea
              value={bulkReason}
              onChange={(event) => setBulkReason(event.target.value)}
              minLength={10}
              maxLength={1000}
            />
          </label>
          <label className="field">
            Status der zugehörigen Messwerte
            <select
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value)}
            >
              <option value="SUSPECT">Verdächtig</option>
              <option value="INVALID">Ungültig</option>
              <option value="ESTIMATED">Geschätzt</option>
              <option value="VALID">Gültig</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                busy || !selected.length || bulkReason.trim().length < 10
              }
              onClick={() => bulk("ACKNOWLEDGE")}
            >
              Ausgewählte Befunde bestätigen
            </Button>
            <Button
              disabled={
                busy || !selected.length || bulkReason.trim().length < 10
              }
              onClick={() => bulk("SET_STATUS")}
            >
              Messwertstatus zuweisen
            </Button>
          </div>
          <p className="muted">
            Statusänderungen betreffen nur Befunde mit Messwert. Sie ändern
            keine Messzahlen und ersetzen keine erneute Qualitätsprüfung.
          </p>
        </div>
        {initial.findings.length === 0 ? (
          <p className="empty-state">
            Keine offenen Befunde. Starten Sie eine Prüfung, um den aktuellen
            Datenbestand zu bewerten.
          </p>
        ) : (
          <div className="stack-md">
            {initial.findings.map((finding) => (
              <article className="card stack-md" key={finding.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(finding.id)}
                    disabled={
                      busy ||
                      (!selected.includes(finding.id) && selected.length >= 100)
                    }
                    onChange={(event) =>
                      setSelected((ids) =>
                        event.target.checked
                          ? [...ids, finding.id]
                          : ids.filter((id) => id !== finding.id),
                      )
                    }
                  />{" "}
                  Befund auswählen: {finding.meter.serialNumber}
                </label>
                {finding.acknowledgedAt && (
                  <p>Bestätigt am {finding.acknowledgedAt} (UTC)</p>
                )}
                <div>
                  <span
                    className={`status-badge ${finding.status.toLowerCase()}`}
                  >
                    {finding.status === "ERROR" ? "Fehler" : "Warnung"}
                  </span>{" "}
                  <strong>{issueLabels[finding.type] ?? finding.type}</strong>
                  <p>{finding.description}</p>
                  <small>
                    {finding.meter.serialNumber} ·{" "}
                    {finding.reading
                      ? new Intl.DateTimeFormat("de-DE", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(finding.reading.timestamp))
                      : "Zeitraum ohne Messwert"}
                  </small>
                </div>
                {finding.reading && (
                  <>
                    <form
                      action={(form) =>
                        correct(form, finding.reading!.id, "CORRECT")
                      }
                      className="form-grid"
                    >
                      <label>
                        Zeitstempel (UTC)
                        <input
                          type="datetime-local"
                          name="timestamp"
                          defaultValue={finding.reading.timestamp.slice(0, 16)}
                          required
                        />
                      </label>
                      <label>
                        Zählerstand
                        <input
                          name="registerValue"
                          defaultValue={finding.reading.registerValue}
                          inputMode="decimal"
                          required
                        />
                      </label>
                      <label>
                        Verbrauch
                        <input
                          name="consumption"
                          defaultValue={finding.reading.consumption}
                          inputMode="decimal"
                          required
                        />
                      </label>
                      <label>
                        Einheit
                        <input
                          name="measurementUnit"
                          defaultValue={finding.reading.measurementUnit}
                          required
                        />
                      </label>
                      <label className="span-full">
                        Begründung (mindestens 10 Zeichen)
                        <textarea
                          name="reason"
                          minLength={10}
                          maxLength={1000}
                          required
                        />
                      </label>
                      <button disabled={busy} className="button-primary">
                        Korrigieren
                      </button>
                      <button
                        formAction={(form) =>
                          correct(form, finding.reading!.id, "MARK_INVALID")
                        }
                        disabled={busy}
                        className="button-secondary"
                      >
                        Als ungültig markieren
                      </button>
                      <button
                        formAction={(form) =>
                          correct(form, finding.reading!.id, "REPLACE")
                        }
                        disabled={busy}
                        className="button-secondary"
                      >
                        Ersatzwert setzen
                      </button>
                    </form>
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => loadHistory(finding.reading!.id)}
                    >
                      Korrekturhistorie anzeigen
                    </button>
                    {history[finding.reading.id]?.map((entry, index) => (
                      <details key={`${entry.createdAt}-${index}`}>
                        <summary>
                          {entry.action} ·{" "}
                          {new Intl.DateTimeFormat("de-DE", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(entry.createdAt))}{" "}
                          · {entry.reason}
                        </summary>
                        <pre>
                          {JSON.stringify(
                            {
                              vorher: entry.beforeData,
                              nachher: entry.afterData,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    ))}
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <nav aria-label="Befundseiten" className="flex gap-4">
        <Link
          href={`/data-quality?${new URLSearchParams({ tenantId, from: initial.filters.from, to: initial.filters.to, ...(initial.filters.meter ? { meter: initial.filters.meter } : {}), ...(initial.filters.type ? { type: initial.filters.type } : {}), ...(initial.filters.status ? { status: initial.filters.status } : {}) })}`}
        >
          Neueste Befunde
        </Link>
        {initial.nextCursor && (
          <Link
            href={`/data-quality?${new URLSearchParams({ tenantId, cursor: initial.nextCursor, from: initial.filters.from, to: initial.filters.to, ...(initial.filters.meter ? { meter: initial.filters.meter } : {}), ...(initial.filters.type ? { type: initial.filters.type } : {}), ...(initial.filters.status ? { status: initial.filters.status } : {}) })}`}
          >
            Weitere Befunde
          </Link>
        )}
      </nav>
      <DataExport tenantId={tenantId} />
    </section>
  );
}
