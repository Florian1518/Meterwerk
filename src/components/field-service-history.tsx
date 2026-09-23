import type { Prisma } from "@/generated/prisma/client";
import { priorityLabels, statusLabels, typeLabels } from "@/lib/field-service";

const labels: Record<string, string> = {
  actorName: "Bearbeitet von",
  before: "Vorher",
  after: "Nachher",
  number: "Auftragsnummer",
  title: "Titel",
  description: "Beschreibung",
  type: "Typ",
  priority: "Priorität",
  status: "Status",
  propertyId: "Liegenschaft",
  buildingId: "Gebäude",
  unitId: "Nutzungseinheit",
  meterId: "Zähler",
  gatewayId: "Gateway",
  internalContactId: "Interner Ansprechpartner",
  customerContact: "Kundenkontakt",
  notes: "Notizen",
  scheduledAt: "Geplanter Termin",
  startedAt: "Beginn",
  endedAt: "Ende",
  technicianName: "Techniker",
  required: "Pflichtpunkt",
  completed: "Erledigt",
  comment: "Kommentar",
  completedAt: "Erledigt am",
  completedByName: "Erledigt von",
  items: "Punkte",
  order: "Reihenfolge",
};
const values: Record<string, string> = {
  ...priorityLabels,
  ...statusLabels,
  ...typeLabels,
};
function text(value: string | number | boolean | null) {
  if (value === null || value === "") return "–";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "string") {
    if (values[value]) return values[value];
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime()))
        return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
    }
  }
  return String(value);
}
export function FieldServiceHistory({ value }: { value: Prisma.JsonValue }) {
  if (value === null || typeof value !== "object")
    return (
      <span className="whitespace-pre-wrap break-words">{text(value)}</span>
    );
  if (Array.isArray(value))
    return (
      <ul className="grid gap-2">
        {value.map((item, i) => (
          <li key={i}>
            <FieldServiceHistory value={item} />
          </li>
        ))}
      </ul>
    );
  return (
    <dl className="grid gap-2 text-sm">
      {Object.entries(value)
        .filter(([key, item]) => labels[key] && item !== undefined)
        .map(([key, item]) => (
          <div key={key}>
            <dt className="font-medium">{labels[key]}</dt>
            <dd className="pl-3">
              <FieldServiceHistory value={item!} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
