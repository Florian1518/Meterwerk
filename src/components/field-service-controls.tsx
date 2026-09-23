"use client";
import { useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import {
  priorityLabels,
  typeLabels,
  workOrderPriorities,
  workOrderTypes,
} from "@/lib/field-service";
import type { fieldServiceOptions, getWorkOrder } from "@/server/field-service";

type Operation =
  | "order"
  | "status"
  | "assignment"
  | "remove-assignment"
  | "checklist"
  | "item"
  | "comment"
  | "delete";
export function FieldServiceForm({
  tenantId,
  id,
  operation,
  target,
  children,
  label,
  redirectAfter,
}: {
  tenantId: string;
  id?: string;
  operation: Operation;
  target?: string;
  children?: ReactNode;
  label: string;
  redirectAfter?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      if (!navigator.onLine)
        throw new Error(
          "Offline: Bitte Verbindung herstellen. Änderungen wurden nicht gespeichert.",
        );
      let body: unknown;
      let suffix = "";
      let method = "POST";
      if (operation === "order") {
        const value = Object.fromEntries(data.entries());
        body = {
          ...value,
          ...Object.fromEntries(
            [
              "buildingId",
              "unitId",
              "meterId",
              "gatewayId",
              "internalContactId",
            ].map((key) => [key, value[key] || null]),
          ),
          scheduledAt: value.scheduledAt
            ? new Date(`${value.scheduledAt}Z`).toISOString()
            : null,
        };
        method = id ? "PATCH" : "POST";
      } else if (operation === "status") {
        suffix = "/status";
        body = { status: target };
      } else if (operation === "assignment") {
        suffix = "/assignments";
        body = { userId: data.get("userId") };
      } else if (operation === "remove-assignment") {
        suffix = `/assignments/${encodeURIComponent(target!)}`;
        method = "DELETE";
      } else if (operation === "comment") {
        suffix = "/comments";
        body = { body: data.get("body") };
      } else if (operation === "checklist") {
        suffix = "/checklists";
        const titles = data.getAll("itemTitle"),
          descriptions = data.getAll("itemDescription");
        body = {
          title: data.get("title"),
          items: titles.map((title, order) => ({
            title,
            description: descriptions[order],
            required: data.has(`required-${order}`),
            order,
          })),
        };
      } else if (operation === "item") {
        suffix = `/checklist-items/${encodeURIComponent(target!)}`;
        method = "PATCH";
        body = {
          completed: data.has("completed"),
          comment: data.get("comment"),
        };
      } else {
        method = "DELETE";
      }
      const response = await fetch(
        `/api/work-orders${id ? `/${encodeURIComponent(id)}` : ""}${suffix}?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Speichern fehlgeschlagen.");
      setMessage("Gespeichert.");
      if (operation === "comment") form.reset();
      if (redirectAfter) router.push(redirectAfter);
      else if (operation === "order" && !id)
        router.push(
          `/work-orders/${result.id}?tenantId=${encodeURIComponent(tenantId)}`,
        );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <fieldset disabled={busy} className="grid min-w-0 gap-3">
        {children}
        <Button type="submit" className="w-fit min-h-11">
          {busy ? "Wird gespeichert …" : label}
        </Button>
      </fieldset>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}

type Options = Awaited<ReturnType<typeof fieldServiceOptions>>;
export function WorkOrderEditor({
  tenantId,
  options,
  initial,
}: {
  tenantId: string;
  options: Options;
  initial?: Awaited<ReturnType<typeof getWorkOrder>>;
}) {
  const [propertyId, setPropertyId] = useState(initial?.propertyId ?? "");
  const [buildingId, setBuildingId] = useState(initial?.buildingId ?? "");
  const [unitId, setUnitId] = useState(initial?.unitId ?? "");
  const [meterId, setMeterId] = useState(initial?.meterId ?? "");
  const buildings =
    options.properties.find((p) => p.id === propertyId)?.buildings ?? [];
  const units = buildings
    .filter((b) => !buildingId || b.id === buildingId)
    .flatMap((b) => b.units);
  const meters = units
    .filter((u) => !unitId || u.id === unitId)
    .flatMap((u) => u.meters);
  return (
    <FieldServiceForm
      tenantId={tenantId}
      id={initial?.id}
      operation="order"
      label={initial ? "Änderungen speichern" : "Einsatz erstellen"}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          Titel
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={initial?.title}
          />
        </label>
        <label>
          Typ
          <select name="type" defaultValue={initial?.type ?? "INSTALLATION"}>
            {workOrderTypes.map((type) => (
              <option key={type} value={type}>
                {typeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priorität
          <select name="priority" defaultValue={initial?.priority ?? "NORMAL"}>
            {workOrderPriorities.map((p) => (
              <option key={p} value={p}>
                {priorityLabels[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Geplanter Termin (UTC)
          <input
            type="datetime-local"
            name="scheduledAt"
            defaultValue={
              initial?.scheduledAt
                ? new Date(initial.scheduledAt).toISOString().slice(0, 16)
                : ""
            }
          />
        </label>
        <label>
          Liegenschaft
          <select
            name="propertyId"
            required
            value={propertyId}
            onChange={(e) => {
              setPropertyId(e.target.value);
              setBuildingId("");
              setUnitId("");
              setMeterId("");
            }}
          >
            <option value="">Bitte wählen</option>
            {options.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gebäude (optional)
          <select
            name="buildingId"
            value={buildingId}
            onChange={(e) => {
              setBuildingId(e.target.value);
              setUnitId("");
              setMeterId("");
            }}
          >
            <option value="">Keine Zuordnung</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nutzungseinheit (optional)
          <select
            name="unitId"
            value={unitId}
            onChange={(e) => {
              setUnitId(e.target.value);
              setMeterId("");
            }}
          >
            <option value="">Keine Zuordnung</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zähler (optional)
          <select
            name="meterId"
            value={meterId}
            onChange={(e) => setMeterId(e.target.value)}
          >
            <option value="">Keine Zuordnung</option>
            {meters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.serialNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gateway (optional)
          <select name="gatewayId" defaultValue={initial?.gatewayId ?? ""}>
            <option value="">Keine Zuordnung</option>
            {options.gateways.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Interner Ansprechpartner
          <select
            name="internalContactId"
            defaultValue={initial?.internalContactId ?? ""}
          >
            <option value="">Keine Zuordnung</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Beschreibung
        <textarea
          name="description"
          maxLength={8000}
          defaultValue={initial?.description}
        />
      </label>
      <label>
        Kundenkontakt (soweit vorhanden)
        <textarea
          name="customerContact"
          maxLength={1000}
          defaultValue={initial?.customerContact}
        />
      </label>
      <label>
        Notizen
        <textarea name="notes" maxLength={8000} defaultValue={initial?.notes} />
      </label>
    </FieldServiceForm>
  );
}
export function ChecklistEditor({
  tenantId,
  id,
}: {
  tenantId: string;
  id: string;
}) {
  const [count, setCount] = useState(1);
  return (
    <FieldServiceForm
      tenantId={tenantId}
      id={id}
      operation="checklist"
      label="Checkliste hinzufügen"
    >
      <label>
        Checklistenname
        <input name="title" required maxLength={200} />
      </label>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grid gap-2 rounded-lg border p-3">
          <label>
            Punkt {index + 1}
            <input name="itemTitle" required maxLength={200} />
          </label>
          <label>
            Beschreibung
            <textarea name="itemDescription" maxLength={2000} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name={`required-${index}`} />
            Pflichtpunkt
          </label>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={count >= 100}
        onClick={() => setCount(count + 1)}
      >
        Weiteren Punkt hinzufügen
      </Button>
    </FieldServiceForm>
  );
}
