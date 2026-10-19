import Link from "next/link";
import { requirePageActor } from "@/server/auth";
import { getDeviceDetail } from "@/server/device-management";
import { tenantScope } from "@/server/policy";
import { requireGatewayAdminPage } from "@/server/gateway-admin";
import { DecommissionDevice } from "@/components/gateway-admin-controls";
export default async function DeviceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tenantId?: string; platformAdmin?: string }>;
}) {
  const q = await searchParams;
  const actor =
    q.platformAdmin === "1"
      ? await requireGatewayAdminPage()
      : await requirePageActor();
  const tenantId = tenantScope(actor, q.tenantId);
  const d = await getDeviceDetail((await params).id, tenantId);
  return (
    <>
      <p>
        <Link
          className="text-link"
          href={
            q.platformAdmin === "1"
              ? "/platform-admin/gateways/devices"
              : `/devices?tenantId=${encodeURIComponent(tenantId)}`
          }
        >
          ←{" "}
          {q.platformAdmin === "1"
            ? "Zentrale Geräteverwaltung"
            : "Geräteverwaltung"}
        </Link>
      </p>
      <h1>{d.name ?? d.externalDeviceId}</h1>
      <p>
        {d.manufacturer} {d.model} · Seriennummer{" "}
        {d.serialNumber ?? d.meter.serialNumber}
      </p>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="panel">
          <h2>Stammdaten und Status</h2>
          <p>
            Lifecycle: <strong>{d.lifecycleStatus}</strong>
          </p>
          <p>
            Health: {d.status} · Protokoll: {d.protocol}
          </p>
          <p>
            Firmware: {d.firmwareVersion ?? "—"} · Ziel:{" "}
            {d.desiredFirmwareVersion ?? "—"}
          </p>
          <p>Letzter Kontakt: {d.lastSeenAt?.toISOString() ?? "—"}</p>
          <p>Tags: {Array.isArray(d.tags) ? d.tags.join(", ") : "—"}</p>
        </article>
        <article className="panel">
          <h2>Zuordnung</h2>
          <p>
            Zähler: {d.meter.serialNumber} ({d.meter.type})
          </p>
          <p>Gateway: {d.gateway?.name ?? "—"}</p>
          <p>Liegenschaft: {d.meter.unit.building.property.name}</p>
          <p>
            Gebäude: {d.meter.unit.building.name} · Einheit: {d.meter.unit.name}
          </p>
          <p>
            Profil:{" "}
            {d.profile
              ? `${d.profile.manufacturer} ${d.profile.model} v${d.profile.version}`
              : "—"}
          </p>
        </article>
        <article className="panel">
          <h2>Provisioning und Konfiguration</h2>
          <p>
            Jobs: {d.commands.length} · letzter Status:{" "}
            {d.commands[0]?.status ?? "—"}
          </p>
          <p>Konfigurationsversionen: {d.configurationVersions.length}</p>
          <p>Keine Hardwarekommunikation wird durch diese Ansicht ausgelöst.</p>
        </article>
        <article className="panel">
          <h2>Credentials</h2>
          {d.credentials.map((c) => (
            <p key={c.id}>
              {c.id} · {c.status} · zuletzt genutzt{" "}
              {c.lastUsedAt?.toISOString() ?? "—"}
            </p>
          ))}
          {d.credentials.length === 0 && <p>Keine Credentials.</p>}
        </article>
        <article className="panel">
          <h2>Messwerte und Ereignisse</h2>
          <p>Letzte Messwerte: {d.readings.length}</p>
          {d.readings.slice(0, 5).map((r) => (
            <p key={r.id}>
              {r.timestamp.toISOString()} · {r.registerValue.toString()}{" "}
              {r.measurementUnit}
            </p>
          ))}
        </article>
        <article className="panel">
          <h2>Wartungshistorie</h2>
          {d.maintenanceEvents.map((e) => (
            <p key={e.id}>
              {e.createdAt.toISOString()} · {e.kind} · {e.notes}
            </p>
          ))}
          {d.maintenanceEvents.length === 0 && <p>Keine Wartungseinträge.</p>}
        </article>
      </section>
      {q.platformAdmin === "1" && d.lifecycleStatus !== "DECOMMISSIONED" && (
        <div className="mt-4">
          <DecommissionDevice deviceId={d.id} tenantId={tenantId} />
        </div>
      )}
      {q.platformAdmin === "1" && d.lifecycleStatus === "DECOMMISSIONED" && (
        <p className="panel mt-4">
          Dieses Gerät ist stillgelegt. Diese Lifecycle-Transition kann nicht
          rückgängig gemacht werden.
        </p>
      )}
    </>
  );
}
