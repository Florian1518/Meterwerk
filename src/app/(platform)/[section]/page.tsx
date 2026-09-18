import { notFound } from "next/navigation";
import { requirePageActor } from "@/server/auth";
import { pageContext } from "@/server/page-context";
import { listResource, listTenants, type Resource } from "@/server/data";
import { DataTable, type TableRow } from "@/components/data-table";
import { CreateForm, type Field } from "@/components/create-form";
import { TenantSelect } from "@/components/tenant-select";
import { typeLabels } from "@/server/dashboard";
import { GrantList } from "@/components/grant-list";
import { editableResources } from "@/server/crud";
const config: Record<
  string,
  { title: string; description: string; headers: string[]; fields: Field[] }
> = {
  tenants: {
    title: "Kunden",
    description: "Mandanten zentral anlegen und verwalten.",
    headers: ["Unternehmen", "Kürzel", "Liegenschaften", "Benutzer"],
    fields: [
      { name: "name", label: "Unternehmensname" },
      { name: "slug", label: "Kürzel (a–z, 0–9, Bindestrich)" },
    ],
  },
  properties: {
    title: "Liegenschaften",
    description: "Ihr Immobilienportfolio auf einen Blick.",
    headers: ["Liegenschaft", "Adresse", "Stadt", "Gebäude"],
    fields: [
      { name: "name", label: "Name" },
      { name: "address", label: "Adresse" },
      { name: "city", label: "Stadt" },
    ],
  },
  buildings: {
    title: "Gebäude",
    description: "Gebäude und ihre Zuordnung zu Liegenschaften.",
    headers: ["Gebäude", "Liegenschaft", "Nutzungseinheiten"],
    fields: [
      { name: "name", label: "Name" },
      { name: "propertyId", label: "Liegenschaft", options: [] },
    ],
  },
  units: {
    title: "Nutzungseinheiten",
    description: "Wohnungen, Gewerbe und gemeinschaftliche Flächen.",
    headers: ["Einheit", "Gebäude", "Etage", "Fläche m²", "Zähler"],
    fields: [
      { name: "name", label: "Name" },
      { name: "buildingId", label: "Gebäude", options: [] },
      { name: "floor", label: "Etage" },
      { name: "area", label: "Fläche m²", type: "number" },
    ],
  },
  meters: {
    title: "Zähler",
    description: "Gerätebestand, Zuordnung und Verbindungsstatus.",
    headers: [
      "Seriennummer",
      "Typ",
      "Nutzungseinheit",
      "Hersteller / Modell",
      "Status",
      "Letzter Kontakt (UTC)",
    ],
    fields: [
      { name: "serialNumber", label: "Seriennummer" },
      { name: "externalDeviceId", label: "Externe Geräte-ID", optional: true },
      { name: "unitId", label: "Nutzungseinheit", options: [] },
      {
        name: "type",
        label: "Zählerart",
        options: Object.entries(typeLabels).map(([id, name]) => ({ id, name })),
      },
      { name: "manufacturer", label: "Hersteller" },
      { name: "model", label: "Modell" },
      { name: "location", label: "Standort" },
      { name: "installedAt", label: "Installationsdatum", type: "date" },
      {
        name: "status",
        label: "Status",
        options: [
          { id: "ACTIVE", name: "Aktiv" },
          { id: "OFFLINE", name: "Offline" },
          { id: "MAINTENANCE", name: "Wartung" },
        ],
        value: "MAINTENANCE",
      },
    ],
  },
  users: {
    title: "Benutzer",
    description: "Zugänge und Rollen innerhalb des ausgewählten Unternehmens.",
    headers: ["Name", "E-Mail", "Rolle", "Status"],
    fields: [
      { name: "name", label: "Name" },
      { name: "email", label: "E-Mail", type: "email" },
      {
        name: "password",
        label: "Initiales Passwort (mind. 14 Zeichen)",
        type: "password",
      },
      {
        name: "role",
        label: "Rolle",
        options: ["TENANT_ADMIN", "MANAGER", "USER"].map((id) => ({
          id,
          name: id,
        })),
      },
    ],
  },
  alarms: {
    title: "Alarme",
    description: "Auffällige Verbräuche und Geräteausfälle bearbeiten.",
    headers: ["Alarm", "Zähler", "Priorität", "Status", "Erstellt (UTC)"],
    fields: [
      { name: "title", label: "Alarmtitel" },
      { name: "meterId", label: "Zähler", options: [] },
      {
        name: "severity",
        label: "Priorität",
        options: [
          { id: "LOW", name: "Niedrig" },
          { id: "MEDIUM", name: "Mittel" },
          { id: "HIGH", name: "Hoch" },
        ],
      },
      {
        name: "status",
        label: "Status",
        options: [
          { id: "OPEN", name: "Offen" },
          { id: "ACKNOWLEDGED", name: "Bestätigt" },
          { id: "RESOLVED", name: "Erledigt" },
        ],
        value: "OPEN",
      },
    ],
  },
  devices: {
    title: "Devices",
    description:
      "Digitale Kommunikationsendpunkte und ihre technische Verbindung.",
    headers: [
      "Device-ID",
      "Zähler",
      "Protokoll",
      "Status",
      "Firmware",
      "Letzter Kontakt",
    ],
    fields: [],
  },
  gateways: {
    title: "Gateways",
    description: "Kommunikationsgeräte für mehrere Zähler.",
    headers: [
      "Gateway",
      "Externe ID",
      "Hersteller / Modell",
      "Status",
      "Devices",
    ],
    fields: [],
  },
};
type RecordRow = {
  id: string;
  name?: string;
  slug?: string;
  address?: string;
  city?: string;
  floor?: string;
  area?: string;
  serialNumber?: string;
  type?: keyof typeof typeLabels;
  manufacturer?: string;
  model?: string;
  status?: string;
  lastContact?: string;
  lastSeenAt?: string;
  externalGatewayId?: string;
  email?: string;
  role?: string;
  active?: boolean;
  title?: string;
  severity?: string;
  createdAt?: string;
  propertyId?: string;
  buildingId?: string;
  unitId?: string;
  meterId?: string;
  externalDeviceId?: string;
  installedAt?: string;
  location?: string;
  grants?: { propertyId: string; property: { name: string } }[];
  unit?: { name: string };
  building?: { name: string };
  property?: { name: string };
  meter?: { serialNumber: string };
  gateway?: { name: string };
  protocol?: string;
  firmwareVersion?: string;
  _count?: {
    properties?: number;
    users?: number;
    buildings?: number;
    units?: number;
    meters?: number;
    devices?: number;
  };
};
const statuses: Record<string, string> = {
  ACTIVE: "Aktiv",
  OFFLINE: "Offline",
  MAINTENANCE: "Wartung",
  OPEN: "Offen",
  ACKNOWLEDGED: "Bestätigt",
  RESOLVED: "Erledigt",
  ONLINE: "Online",
  WARNING: "Warnung",
  DISABLED: "Deaktiviert",
};
const date = (value?: string) =>
  value
    ? new Date(value).toLocaleString("de-DE", { timeZone: "UTC" })
    : "Noch kein Kontakt";
export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { section } = await params;
  const query = await searchParams;
  if (!config[section] && section !== "settings") notFound();
  const actor = await requirePageActor();
  if (
    (section === "tenants" && actor.role !== "SUPER_ADMIN") ||
    (section === "users" &&
      !["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role))
  )
    notFound();
  const ctx = section === "tenants" ? null : await pageContext(query.tenantId);
  const tenantId = ctx?.tenantId;
  const manage = ["SUPER_ADMIN", "TENANT_ADMIN"].includes(actor.role);
  if (section === "settings")
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">VERWALTUNG</div>
            <h1>Einstellungen</h1>
            <p>Aktuelle Plattformkonfiguration und Integrationsstatus.</p>
          </div>
          <TenantSelect tenants={ctx!.tenants} tenantId={tenantId!} />
        </div>
        <section className="panel settings-grid">
          <div>
            <h2>Arbeitsbereich</h2>
            <dl>
              <dt>Unternehmen</dt>
              <dd>{ctx!.tenant.name}</dd>
              <dt>Ihre Rolle</dt>
              <dd>{actor.role}</dd>
              <dt>Berichtszeitzone</dt>
              <dd>UTC</dd>
              <dt>Währung</dt>
              <dd>EUR (Demo-Kostenschätzung)</dd>
              <dt>Sitzungsdauer</dt>
              <dd>8 Stunden</dd>
            </dl>
          </div>
          <div>
            <h2>Integrationen</h2>
            <p>Die folgenden Anschlüsse sind noch nicht aktiviert.</p>
            {[
              "MQTT / Smart-Meter-Gateways",
              "Geräte-REST-API / Webhooks",
              "Abrechnung / Tarifverwaltung",
              "E-Mail / Benachrichtigungen",
            ].map((item) => (
              <div className="integration-row" key={item}>
                {item}
                <span className="badge">Geplant</span>
              </div>
            ))}
          </div>
        </section>
        {manage && (
          <CreateForm
            kind="settings"
            tenantId={tenantId}
            title="Unternehmensname bearbeiten"
            fields={[
              {
                name: "name",
                label: "Unternehmensname",
                value: ctx!.tenant.name,
              },
            ]}
          />
        )}
      </>
    );
  const def = config[section];
  const records = JSON.parse(
    JSON.stringify(
      section === "tenants"
        ? await listTenants(actor)
        : await listResource(actor, section as Resource, tenantId),
    ),
  ) as RecordRow[];
  const fields = def.fields.map((f) => ({ ...f }));
  const parent =
    section === "buildings"
      ? "properties"
      : section === "units"
        ? "buildings"
        : section === "meters"
          ? "units"
          : section === "alarms"
            ? "meters"
            : null;
  if (parent && manage) {
    const options = await listResource(actor, parent, tenantId);
    const field = fields.find(
      (f) =>
        f.name ===
        (parent === "properties"
          ? "propertyId"
          : parent === "buildings"
            ? "buildingId"
            : parent === "units"
              ? "unitId"
              : "meterId"),
    );
    if (field)
      field.options = options.map((row) => ({
        id: row.id,
        name:
          "name" in row
            ? String(row.name)
            : "serialNumber" in row
              ? String(row.serialNumber)
              : row.id,
      }));
  }
  const rows: TableRow[] = records.map((r) => {
    let cells: unknown[] = [];
    switch (section) {
      case "tenants":
        cells = [r.name, r.slug, r._count?.properties, r._count?.users];
        break;
      case "properties":
        cells = [r.name, r.address, r.city, r._count?.buildings];
        break;
      case "buildings":
        cells = [r.name, r.property?.name, r._count?.units];
        break;
      case "units":
        cells = [r.name, r.building?.name, r.floor, r.area, r._count?.meters];
        break;
      case "meters":
        cells = [
          r.serialNumber,
          r.type && typeLabels[r.type],
          r.unit?.name,
          `${r.manufacturer} / ${r.model}`,
          statuses[r.status!],
          date(r.lastContact),
        ];
        break;
      case "users":
        cells = [r.name, r.email, r.role, r.active ? "Aktiv" : "Deaktiviert"];
        break;
      case "alarms":
        cells = [
          r.title,
          r.meter?.serialNumber,
          r.severity === "HIGH" ? "Hoch" : "Mittel",
          statuses[r.status!],
          date(r.createdAt),
        ];
        break;
      case "devices":
        cells = [
          r.externalDeviceId,
          r.meter?.serialNumber,
          r.protocol,
          statuses[r.status!],
          r.firmwareVersion ?? "—",
          date(r.lastSeenAt),
        ];
        break;
      case "gateways":
        cells = [
          r.name,
          r.externalGatewayId,
          `${r.manufacturer} / ${r.model}`,
          statuses[r.status!],
          r._count?.devices,
        ];
        break;
    }
    return {
      id: r.id,
      values: Object.fromEntries(
        Object.entries(r)
          .filter(([, v]) => v !== null && typeof v !== "object")
          .map(([key, v]) => [
            key,
            key === "installedAt" ? String(v).slice(0, 10) : String(v),
          ]),
      ),
      cells: cells.map((v) => String(v ?? "—")),
      ...(section === "tenants"
        ? { href: `/dashboard?tenantId=${r.id}` }
        : section === "meters"
          ? { href: `/meters/${r.id}?tenantId=${tenantId}` }
          : {}),
    };
  });
  const properties =
    section === "users" && manage
      ? await listResource(actor, "properties", tenantId)
      : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {ctx?.tenant.name ?? "PLATTFORMVERWALTUNG"}
          </div>
          <h1>{def.title}</h1>
          <p>{def.description}</p>
        </div>
        {ctx && <TenantSelect tenants={ctx.tenants} tenantId={tenantId!} />}
      </div>
      {manage && fields.length > 0 && (
        <CreateForm
          key={`${section}-${tenantId}`}
          kind={section}
          tenantId={tenantId}
          fields={fields}
          title={section === "tenants" ? "Kunden anlegen" : "Eintrag anlegen"}
        />
      )}
      <DataTable
        headers={def.headers}
        rows={rows}
        editor={
          manage &&
          editableResources.includes(
            section as (typeof editableResources)[number],
          )
            ? { kind: section, tenantId, fields }
            : undefined
        }
      />
      {section === "users" && manage && (
        <CreateForm
          kind="grant"
          tenantId={tenantId}
          title="Liegenschaft für USER freigeben"
          fields={[
            {
              name: "userId",
              label: "Benutzer",
              options: records
                .filter((r) => r.role === "USER")
                .map((r) => ({ id: r.id, name: r.name! })),
            },
            {
              name: "propertyId",
              label: "Liegenschaft",
              options: properties.map((p) => ({
                id: p.id,
                name: "name" in p ? String(p.name) : p.id,
              })),
            },
          ]}
        />
      )}
      {section === "users" && manage && (
        <GrantList
          tenantId={tenantId!}
          grants={records.flatMap((r) =>
            (r.grants ?? []).map((g) => ({
              userId: r.id,
              userName: r.name!,
              propertyId: g.propertyId,
              propertyName: g.property.name,
            })),
          )}
        />
      )}
      {section === "alarms" && manage && (
        <CreateForm
          kind="alarm"
          tenantId={tenantId}
          title="Alarm bearbeiten"
          fields={[
            {
              name: "id",
              label: "Alarm",
              options: records
                .filter((r) => r.status !== "RESOLVED")
                .map((r) => ({
                  id: r.id,
                  name: `${r.title} · ${r.meter?.serialNumber}`,
                })),
            },
            {
              name: "status",
              label: "Neuer Status",
              options: [
                { id: "ACKNOWLEDGED", name: "Bestätigt" },
                { id: "RESOLVED", name: "Erledigt" },
              ],
            },
          ]}
        />
      )}
      <p className="data-note">
        {section === "tenants"
          ? "Kundennamen öffnen das jeweilige Portfolio."
          : "Alle angezeigten Daten sind auf Ihren Mandanten und Ihre Freigaben beschränkt."}{" "}
        Listen zeigen maximal 200 Einträge.
      </p>
    </>
  );
}
