"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "./ui/button";

type Resource =
  | "properties"
  | "buildings"
  | "units"
  | "meters"
  | "devices"
  | "gateways"
  | "readings";
type Preview = {
  id: string;
  resource: Resource;
  headers: string[];
  fields: { field: string; required: boolean; type: string }[];
  rowCount: number;
  preview: Record<string, unknown>[];
  errors: { row: number; field?: string; message: string }[];
  errorCount: number;
  canConfirm: boolean;
};
const options: { value: Resource; label: string }[] = [
  { value: "properties", label: "Liegenschaften" },
  { value: "buildings", label: "Gebäude" },
  { value: "units", label: "Nutzungseinheiten" },
  { value: "meters", label: "Zähler" },
  { value: "devices", label: "Devices" },
  { value: "gateways", label: "Gateways" },
  { value: "readings", label: "Historische Messwerte" },
];

export function DataImport({ tenantId }: { tenantId: string }) {
  const [resource, setResource] = useState<Resource>("properties");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const guessed = useMemo(
    () =>
      Object.fromEntries(
        (preview?.fields ?? []).map(({ field }) => [
          field,
          preview?.headers.find(
            (header) => header.toLowerCase() === field.toLowerCase(),
          ) ?? "",
        ]),
      ),
    [preview],
  );

  async function makePreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setMessage("Bitte zuerst eine CSV-Datei auswählen.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("resource", resource);
      body.set("tenantId", tenantId);
      body.set("mapping", JSON.stringify(mapping));
      const response = await fetch("/api/imports/preview", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Vorschau konnte nicht erstellt werden.");
      setPreview(data);
      const auto = Object.fromEntries(
        data.fields.map((field: { field: string }) => [
          field.field,
          data.headers.find(
            (header: string) =>
              header.toLowerCase() === field.field.toLowerCase(),
          ) ?? "",
        ]),
      );
      setMapping((current) => (Object.keys(current).length ? current : auto));
      setMessage(
        data.canConfirm
          ? "Daten geprüft. Der Import kann bestätigt werden."
          : `${data.errorCount} Prüfhinweis(e). Ordne die Spalten zu oder korrigiere die Datei.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Vorschau fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview?.canConfirm) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/imports/${encodeURIComponent(preview.id)}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tenantId }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import fehlgeschlagen.");
      setMessage(`${data.imported} Datensätze wurden atomar importiert.`);
      setPreview(null);
      setFile(null);
      setMapping({});
      const input = document.getElementById(
        "import-file",
      ) as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Import fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form className="panel space-y-4" onSubmit={makePreview}>
        <h2>CSV-Datei vorbereiten</h2>
        <label className="field">
          <span>Datentyp</span>
          <select
            value={resource}
            onChange={(event) => {
              setResource(event.target.value as Resource);
              setPreview(null);
              setMapping({});
            }}
            aria-label="Zu importierender Datentyp"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>CSV-Datei (UTF-8, maximal 5 MB)</span>
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setMapping({});
            }}
            required
          />
        </label>
        <p className="muted">
          Komma oder Semikolon als Trennzeichen; deutsche Dezimalzahlen wie
          1.234,56 werden unterstützt. Zeitstempel müssen eine Zeitzone
          enthalten.
        </p>
        <Button type="submit" disabled={busy || !file}>
          {busy ? "Bitte warten …" : "Vorschau und Prüfung erstellen"}
        </Button>
      </form>
      {preview && (
        <section className="panel space-y-4" aria-live="polite">
          <h2>Spalten zuordnen</h2>
          <p>
            {preview.rowCount} Datenzeilen · Vorschau läuft nach 30 Minuten ab.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {preview.fields.map((field) => (
              <label className="field" key={field.field}>
                <span>
                  {field.field}
                  {field.required ? " *" : " (optional)"}
                </span>
                <select
                  value={mapping[field.field] ?? guessed[field.field] ?? ""}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field.field]: event.target.value,
                    }))
                  }
                >
                  <option value="">Nicht zugeordnet</option>
                  {preview.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setPreview(null);
              void makePreview(
                new Event(
                  "submit",
                ) as unknown as React.FormEvent<HTMLFormElement>,
              );
            }}
          >
            Zuordnung prüfen
          </Button>
          {preview.preview.length > 0 && (
            <div className="overflow-auto">
              <table className="data-table">
                <caption>
                  Vorschau der ersten {Math.min(10, preview.rowCount)} Zeilen,
                  normalisierte Werte
                </caption>
                <thead>
                  <tr>
                    {preview.fields.map((field) => (
                      <th key={field.field} scope="col">
                        {field.field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, index) => (
                    <tr key={index}>
                      {preview.fields.map((field) => (
                        <td key={field.field}>
                          {String(row[field.field] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.errorCount > 0 && (
            <div role="alert">
              <strong>{preview.errorCount} Fehler/Hinweise</strong>
              <ul>
                {preview.errors.map((error, index) => (
                  <li key={index}>
                    Zeile {error.row}
                    {error.field ? ` · ${error.field}` : ""}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button
            type="button"
            disabled={busy || !preview.canConfirm}
            onClick={confirm}
          >
            Import atomar bestätigen
          </Button>
        </section>
      )}
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
      <section className="panel">
        <h2>Benutzerkonten</h2>
        <p>
          Benutzer werden über Einladungen mit sicherem, einmaligem
          Einladungslink angelegt. Ein direkter Benutzerimport mit Passwörtern
          ist nicht verfügbar.
        </p>
        <Link href="/users">Einladungen verwalten</Link>
      </section>
    </div>
  );
}
