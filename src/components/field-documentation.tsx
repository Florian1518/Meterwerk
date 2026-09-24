"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { categories, netMinutes, timeSchema } from "@/lib/field-documentation";

type Entry = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { name: string };
};
type Props = {
  id: string;
  tenantId: string;
  revision: number;
  type: string;
  editable: boolean;
  actorId: string;
  documentation: Record<string, unknown> | null;
  commissioning: Record<string, unknown> | null;
  entries: Entry[];
  technicians: { id: string; name: string }[];
  attachments: {
    id: string;
    fileName: string;
    category: string;
    sizeBytes: number;
    description: string;
  }[];
  templates: { id: string; title: string; medium: string; type: string }[];
};
const labels: Record<string, string> = {
  oldMeterId: "Alter Zähler (ID)",
  newMeterId: "Neuer Zähler (ID)",
  removedRegister: "Ausbauzählerstand",
  installedRegister: "Einbauzählerstand",
  removedAt: "Ausbaudatum / Uhrzeit (UTC)",
  installedAt: "Einbaudatum / Uhrzeit (UTC)",
  reason: "Grund des Wechsels",
  report: "Arbeitsbericht",
  workPerformed: "Ausgeführte Arbeiten",
  defects: "Festgestellte Mängel",
  recommendations: "Empfehlungen",
  internalNotes: "Interne Notizen",
  customerNotes: "Kundennotizen",
  actualStart: "Tatsächlicher Beginn (UTC)",
  actualEnd: "Tatsächliches Ende (UTC)",
  equipment: "Gerät / Zähler / Gateway",
  serialNumber: "Seriennummer",
  protocol: "Protokoll",
  deviceProfileId: "Device-Profile-ID (optional)",
  location: "Installationsort",
  communicationChecked: "Kommunikation geprüft",
  readingsPlausible: "Messwerte plausibel",
  clockChecked: "Uhrzeit / Zeitzone geprüft",
  mappingChecked: "Zählerzuordnung geprüft",
  gatewayChecked: "Gateway-Verbindung geprüft",
  result: "Ergebnis",
  notes: "Bemerkungen",
  articleNumber: "Artikelnummer (optional)",
  description: "Bezeichnung",
  quantity: "Menge",
  unit: "Einheit",
  comment: "Kommentar",
  start: "Beginn (UTC)",
  end: "Ende (UTC)",
  pauseMinutes: "Pause (Minuten)",
  activity: "Tätigkeit",
  correctionReason: "Begründung der Korrektur",
  name: "Name der unterzeichnenden Person",
  role: "Rolle",
  replacementId: "Bestehendes Zählerwechselprotokoll (ID)",
  customerContact: "Kunde / Ansprechpartner",
};
function Field({
  name,
  value,
  kind = "text",
  required = false,
}: {
  name: string;
  value?: unknown;
  kind?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1">
      {labels[name] ?? name}
      {kind === "textarea" ? (
        <textarea
          name={name}
          defaultValue={String(value ?? "")}
          required={required}
          maxLength={4000}
          rows={3}
        />
      ) : kind === "checkbox" ? (
        <input name={name} type="checkbox" defaultChecked={value === true} />
      ) : (
        <input
          name={name}
          type={kind}
          defaultValue={String(value ?? "").replace(/Z$/, "")}
          required={required}
          maxLength={500}
          step={kind === "number" ? "1" : undefined}
        />
      )}
    </label>
  );
}
function SignaturePad() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<number[][][]>([]);
  const drawing = useRef(false);
  const [encoded, setEncoded] = useState("[]");
  return (
    <div className="grid gap-2">
      <p>
        Mit Finger oder Stift unterschreiben. Einsatz-/Abnahmebestätigung, keine
        qualifizierte elektronische Signatur.
      </p>
      <canvas
        ref={canvas}
        width={600}
        height={200}
        aria-label="Unterschriftsfläche"
        className="w-full max-w-xl touch-none rounded border bg-white"
        onPointerDown={(e) => {
          if (strokes.current.length >= 10) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          strokes.current.push([]);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const bounds = e.currentTarget.getBoundingClientRect();
          const point = [
            Math.round(
              Math.max(
                0,
                Math.min(600, ((e.clientX - bounds.left) * 600) / bounds.width),
              ),
            ),
            Math.round(
              Math.max(
                0,
                Math.min(200, ((e.clientY - bounds.top) * 200) / bounds.height),
              ),
            ),
          ];
          const stroke = strokes.current.at(-1)!;
          if (stroke.length >= 150) return;
          const previous = stroke.at(-1);
          stroke.push(point);
          const ctx = canvas.current?.getContext("2d");
          if (ctx && previous) {
            ctx.beginPath();
            ctx.moveTo(previous[0], previous[1]);
            ctx.lineTo(point[0], point[1]);
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }}
        onPointerUp={() => {
          drawing.current = false;
          strokes.current = strokes.current.filter((s) => s.length >= 2);
          setEncoded(JSON.stringify(strokes.current));
        }}
        onPointerCancel={() => {
          drawing.current = false;
          strokes.current = strokes.current.filter((s) => s.length >= 2);
          setEncoded(JSON.stringify(strokes.current));
        }}
      />
      <input type="hidden" name="strokes" value={encoded} />
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          strokes.current = [];
          setEncoded("[]");
          canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 200);
        }}
      >
        Zeichnung leeren
      </Button>
      <label>
        <input name="accepted" type="checkbox" required /> Ich bestätige den
        dokumentierten Einsatz / die Abnahme.
      </label>
    </div>
  );
}

export function FieldDocumentation(props: Props) {
  const router = useRouter();
  const revision = useRef(props.revision);
  const pending = useRef(
    new Map<string, { key: string; body: string | FormData }>(),
  );
  const [busy, setBusy] = useState(false);
  const [dirtySlots, setDirtySlots] = useState<Set<string>>(new Set());
  const dirty = dirtySlots.size > 0;
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(true);
  useEffect(() => {
    revision.current = props.revision;
  }, [props.revision]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty || pending.current.size) e.preventDefault();
    };
    change();
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
      window.removeEventListener("beforeunload", leave);
    };
  }, [dirty]);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    kind: string,
    entryId?: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const slot = `${kind}:${entryId ?? "new"}`;
    setBusy(true);
    setMessage("");
    try {
      let request = pending.current.get(slot);
      if (!request) {
        const fields = new FormData(form);
        const key = crypto.randomUUID();
        if (kind === "upload") {
          fields.set("targetType", "WORK_ORDER");
          fields.set("entityId", props.id);
          fields.set("requestId", key);
          request = { key, body: fields };
        } else {
          const value: Record<string, unknown> = Object.fromEntries(
            fields.entries(),
          );
          for (const name of [
            "actualStart",
            "actualEnd",
            "start",
            "end",
            "removedAt",
            "installedAt",
          ])
            if (value[name])
              value[name] = new Date(`${value[name]}Z`).toISOString();
          if (kind === "replacement") {
            const names = [
              "oldMeterId",
              "newMeterId",
              "removedAt",
              "removedRegister",
              "installedAt",
              "installedRegister",
              "reason",
            ];
            if (!value.replacementId) {
              delete value.replacementId;
              value.replacement = Object.fromEntries(
                names.map((name) => [name, value[name]]),
              );
            }
            for (const name of names) delete value[name];
          }
          if (kind === "commissioning") {
            for (const name of [
              "communicationChecked",
              "readingsPlausible",
              "clockChecked",
              "mappingChecked",
              "gatewayChecked",
            ])
              value[name] = fields.has(name);
            value.deviceProfileId ||= null;
          }
          if (kind === "time") {
            value.pauseMinutes = Number(value.pauseMinutes);
            if (entryId) value.entryId = entryId;
          }
          if (kind === "signature") {
            value.strokes = JSON.parse(String(value.strokes));
            value.accepted = fields.has("accepted");
          }
          request = {
            key,
            body: JSON.stringify({
              requestId: key,
              revision: revision.current,
              mutation: { kind, value },
            }),
          };
        }
        pending.current.set(slot, request);
      }
      if (!navigator.onLine)
        throw new Error(
          "Offline: Eingaben bleiben im geöffneten Tab. Nach Wiederverbindung mit Speichern erneut übertragen.",
        );
      const response = await fetch(
        `${kind === "upload" ? "/api/attachments" : `/api/work-orders/${encodeURIComponent(props.id)}/documentation`}?tenantId=${encodeURIComponent(props.tenantId)}`,
        {
          method: "POST",
          ...(typeof request.body === "string"
            ? { headers: { "Content-Type": "application/json" } }
            : {}),
          body: request.body,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        // Definite rejection: allow correcting inputs. Network failures retain the exact request.
        if (response.status < 500) pending.current.delete(slot);
        throw new Error(result.error || "Speichern fehlgeschlagen.");
      }
      if (typeof result.revision === "number")
        revision.current = result.revision;
      pending.current.delete(slot);
      setDirtySlots((current) => {
        const next = new Set(current);
        next.delete(slot);
        return next;
      });
      setMessage(
        "Gespeichert. Andere bearbeitete Formulare bitte ebenfalls speichern.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Noch nicht gespeichert.",
      );
    } finally {
      setBusy(false);
    }
  }
  const signed = props.entries.some((e) => e.kind === "signature");
  function form(
    kind: string,
    title: string,
    children: ReactNode,
    entryId?: string,
  ) {
    if (!props.editable || (signed && kind !== "signature")) return null;
    return (
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">{title}</summary>
        <form
          className="mt-4 grid gap-3"
          onChange={() =>
            setDirtySlots((current) =>
              new Set(current).add(`${kind}:${entryId ?? "new"}`),
            )
          }
          onSubmit={(e) => submit(e, kind, entryId)}
        >
          <fieldset
            disabled={
              busy || pending.current.has(`${kind}:${entryId ?? "new"}`)
            }
            className="grid min-w-0 gap-3"
          >
            {children}
          </fieldset>
          <Button disabled={busy} type="submit">
            {pending.current.has(`${kind}:${entryId ?? "new"}`)
              ? "Ausstehende Übertragung wiederholen"
              : "Speichern"}
          </Button>
        </form>
      </details>
    );
  }
  const times = props.entries.filter((e) => e.kind === "time");
  return (
    <section className="grid gap-4" aria-label="Vor-Ort-Dokumentation">
      <h2>Vor-Ort-Dokumentation</h2>
      <p role="status">
        {online ? "Verbindung verfügbar." : "Offline."}{" "}
        {dirty ? "Ungespeicherte Eingaben vorhanden." : ""}{" "}
        {pending.current.size
          ? "Übertragung offen; dasselbe Formular erneut speichern."
          : ""}{" "}
        {message}
      </p>
      <p className="text-sm">
        Zeiten in UTC. Eingaben bleiben nur im geöffneten Tab erhalten; kein
        dauerhafter Browserspeicher. Vor Verlassen alle Formulare speichern. Bei
        Versionskonflikten Eingaben abgleichen und Seite neu laden.
      </p>
      {signed && (
        <p>
          Bestätigte Einsatzdaten sind gesperrt. Weitere erforderliche
          Unterschriften und Abschluss sind möglich.
        </p>
      )}
      {props.documentation && (
        <dl className="grid gap-2">
          {Object.entries(props.documentation).map(([key, value]) => (
            <div key={key}>
              <dt className="font-semibold">{labels[key] ?? key}</dt>
              <dd className="whitespace-pre-wrap">{String(value)}</dd>
            </div>
          ))}
          <div>
            <dt>Einsatzdauer</dt>
            <dd>
              {Math.round(
                (Date.parse(String(props.documentation.actualEnd)) -
                  Date.parse(String(props.documentation.actualStart))) /
                  60000,
              )}{" "}
              Minuten
            </dd>
          </div>
        </dl>
      )}
      {form(
        "documentation",
        "Arbeitsbericht bearbeiten",
        <>
          {[
            "report",
            "workPerformed",
            "defects",
            "recommendations",
            "internalNotes",
            "customerNotes",
          ].map((name) => (
            <Field
              key={name}
              name={name}
              kind="textarea"
              value={props.documentation?.[name]}
              required={["report", "workPerformed"].includes(name)}
            />
          ))}
          {["actualStart", "actualEnd"].map((name) => (
            <Field
              key={name}
              name={name}
              kind="datetime-local"
              value={props.documentation?.[name]}
              required
            />
          ))}
        </>,
      )}
      <h3>Fotos und Anhänge</h3>
      {!props.attachments.length && <p>Noch keine Anhänge.</p>}
      <ul>
        {props.attachments.map((file) => (
          <li key={file.id}>
            <a
              className="underline"
              href={`/api/attachments/${encodeURIComponent(file.id)}?tenantId=${encodeURIComponent(props.tenantId)}`}
            >
              {file.fileName}
            </a>{" "}
            · {file.category} · {file.sizeBytes} Bytes · {file.description}
          </li>
        ))}
      </ul>
      {form(
        "upload",
        "Foto aufnehmen / Datei hochladen",
        <>
          <label>
            Foto (JPEG/PNG), PDF oder UTF-8-Text, maximal 10 MiB
            <input
              name="file"
              type="file"
              accept="image/jpeg,image/png,application/pdf,text/plain"
              required
            />
          </label>
          <label>
            Kameraaufnahme (alternativ oben auswählen)
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const input = e.currentTarget.form?.elements.namedItem(
                  "file",
                ) as HTMLInputElement;
                if (input && e.currentTarget.files?.length) {
                  input.files = e.currentTarget.files;
                }
              }}
            />
          </label>
          <label>
            Kategorie
            <select name="category">
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Beschreibung
            <textarea name="description" maxLength={2000} />
          </label>
        </>,
      )}
      {props.type === "METER_REPLACEMENT" &&
        form(
          "replacement",
          "Zählerwechsel dokumentieren",
          <>
            <p>
              Vorhandene Protokoll-ID angeben oder die folgenden Wechselangaben
              ausfüllen. Es wird derselbe bestehende Zählerwechselprozess
              verwendet.
            </p>
            <Field name="replacementId" />
            {[
              "oldMeterId",
              "newMeterId",
              "removedRegister",
              "installedRegister",
              "reason",
            ].map((name) => (
              <Field key={name} name={name} />
            ))}
            {["removedAt", "installedAt"].map((name) => (
              <Field key={name} name={name} kind="datetime-local" />
            ))}
            <Field name="customerContact" required />
            <Field name="notes" kind="textarea" />
            {["oldPhotoId", "newPhotoId"].map((name) => (
              <label key={name}>
                {name === "oldPhotoId"
                  ? "Foto alter Zähler"
                  : "Foto neuer Zähler"}
                <select name={name} required>
                  <option value="">Bitte wählen</option>
                  {props.attachments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fileName}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </>,
        )}
      {props.commissioning && (
        <dl>
          {Object.entries(props.commissioning).map(([key, value]) => (
            <div key={key}>
              <dt>{labels[key] ?? key}</dt>
              <dd>
                {typeof value === "boolean"
                  ? value
                    ? "Ja"
                    : "Nein"
                  : String(value ?? "–")}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {["INSTALLATION", "COMMISSIONING"].includes(props.type) &&
        form(
          "commissioning",
          "Inbetriebnahme dokumentieren",
          <>
            <p>
              Manuelle Prüfdokumentation; es wird keine Gerätekommunikation
              ausgelöst.
            </p>
            {[
              "equipment",
              "serialNumber",
              "protocol",
              "deviceProfileId",
              "location",
            ].map((name) => (
              <Field
                key={name}
                name={name}
                value={props.commissioning?.[name]}
                required={name !== "deviceProfileId"}
              />
            ))}
            {[
              "communicationChecked",
              "readingsPlausible",
              "clockChecked",
              "mappingChecked",
              "gatewayChecked",
            ].map((name) => (
              <Field
                key={name}
                name={name}
                kind="checkbox"
                value={props.commissioning?.[name]}
              />
            ))}
            <label>
              Ergebnis
              <select
                name="result"
                defaultValue={String(props.commissioning?.result ?? "FAILED")}
              >
                <option value="PASSED">Bestanden</option>
                <option value="PASSED_WITH_NOTES">
                  Bestanden mit Hinweisen
                </option>
                <option value="FAILED">Nicht bestanden</option>
              </select>
            </label>
            <Field
              name="notes"
              kind="textarea"
              value={props.commissioning?.notes}
            />
          </>,
        )}
      <h3>Material</h3>
      {props.entries
        .filter((e) => e.kind === "material")
        .map((e) => (
          <p key={e.id}>
            {String(e.payload.quantity)} {String(e.payload.unit)} ·{" "}
            {String(e.payload.description)} · {String(e.payload.articleNumber)}{" "}
            · {String(e.payload.comment)} · {e.actor.name} · {e.createdAt}
          </p>
        ))}
      {form(
        "material",
        "Material erfassen",
        <>
          {["articleNumber", "description", "quantity", "unit", "comment"].map(
            (name) => (
              <Field
                key={name}
                name={name}
                required={["description", "quantity", "unit"].includes(name)}
              />
            ),
          )}
        </>,
      )}
      <h3>
        Arbeitszeiten · insgesamt{" "}
        {times.reduce((sum, e) => {
          const parsed = timeSchema.safeParse(e.payload);
          return sum + (parsed.success ? netMinutes(parsed.data) : 0);
        }, 0)}{" "}
        Minuten netto
      </h3>
      {props.technicians.map((technician) => (
        <p key={technician.id}>
          {technician.name}:{" "}
          {times
            .filter((e) => e.payload.technicianId === technician.id)
            .reduce((sum, e) => {
              const parsed = timeSchema.safeParse(e.payload);
              return sum + (parsed.success ? netMinutes(parsed.data) : 0);
            }, 0)}{" "}
          Minuten netto
        </p>
      ))}
      {times.map((e) => (
        <div key={e.id}>
          <p>
            {props.technicians.find((t) => t.id === e.payload.technicianId)
              ?.name ?? e.actor.name}{" "}
            · {String(e.payload.start)} – {String(e.payload.end)} · Pause{" "}
            {String(e.payload.pauseMinutes)} Minuten ·{" "}
            {String(e.payload.activity)} · {String(e.payload.comment)}
          </p>
          {form("time", "Zeitblock korrigieren", timeFields(e.payload), e.id)}
        </div>
      ))}
      {form("time", "Arbeitszeit erfassen", timeFields())}
      <h3>Unterschriften</h3>
      {props.entries
        .filter((e) => e.kind === "signature")
        .map((e) => (
          <div key={e.id}>
            <p>
              {String(e.payload.name)} ·{" "}
              {e.payload.role === "CUSTOMER"
                ? "Kunde / Ansprechpartner"
                : "Techniker"}{" "}
              · {e.createdAt}
            </p>
            <svg
              viewBox="0 0 600 200"
              className="max-w-xl rounded border"
              role="img"
              aria-label={`Bestätigung von ${e.payload.name}`}
            >
              {(e.payload.strokes as number[][][]).map((stroke, i) => (
                <polyline
                  key={i}
                  points={stroke.map((p) => p.join(",")).join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                />
              ))}
            </svg>
          </div>
        ))}
      {form(
        "signature",
        "Einsatz / Abnahme bestätigen",
        <>
          <p>
            Erst nach fertiger Dokumentation und Checkliste unterschreiben.
            Danach sind die Einsatzdaten gesperrt.
          </p>
          <Field name="name" required />
          <label>
            Rolle
            <select name="role">
              <option value="TECHNICIAN">Techniker</option>
              <option value="CUSTOMER">Kunde / Ansprechpartner</option>
            </select>
          </label>
          <SignaturePad />
        </>,
      )}
      {!!props.templates.length &&
        form(
          "template",
          "Checklistenvorlage übernehmen",
          <label>
            Passende Vorlage
            <select name="templateId" required>
              {props.templates
                .filter((t) => t.type === props.type)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {t.medium}
                  </option>
                ))}
            </select>
          </label>,
        )}
    </section>
  );
  function timeFields(value?: Record<string, unknown>) {
    return (
      <>
        <label>
          Techniker
          <select
            name="technicianId"
            defaultValue={String(value?.technicianId ?? props.actorId)}
          >
            {props.technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {["start", "end"].map((name) => (
          <Field
            key={name}
            name={name}
            kind="datetime-local"
            value={value?.[name]}
            required
          />
        ))}
        <Field
          name="pauseMinutes"
          kind="number"
          value={value?.pauseMinutes ?? 0}
          required
        />
        <Field name="activity" value={value?.activity} required />
        <Field name="comment" value={value?.comment} />
        {value && <Field name="correctionReason" required />}
      </>
    );
  }
}
