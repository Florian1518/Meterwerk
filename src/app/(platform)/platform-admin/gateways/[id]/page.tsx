import Link from "next/link";
import {
  getAdminGateway,
  requireGatewayAdminPage,
} from "@/server/gateway-admin";
import { GatewayCredentialActions } from "@/components/gateway-admin-controls";
import {
  complianceLabels,
  credentialLabel,
  healthLabels,
  lifecycleLabels,
  meterLabels,
  technicalLabels,
  utcTime,
} from "@/lib/gateway-admin";
export const metadata = {
  title: "Gateway-Details · Gateways & Geräte · Meterwerk",
};
export default async function AdminGatewayDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}) {
  await requireGatewayAdminPage();
  const id = (await params).id,
    query = await searchParams;
  if (!query.tenantId) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  const {
    gateway: g,
    credentials,
    health,
    alerts,
    audit,
    compliance,
  } = await getAdminGateway(id, query.tenantId);
  const properties = Array.from(
    new Map(
      g.devices.flatMap((d) =>
        d.meter.unit.building.property
          ? [
              [
                d.meter.unit.building.property.id,
                d.meter.unit.building.property.name,
              ] as const,
            ]
          : [],
      ),
    ).values(),
  );
  return (
    <>
      <p>
        <Link className="text-link" href="/platform-admin/gateways">
          ← Gateway-Übersicht
        </Link>
      </p>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PLATTFORM · {g.tenant.name}</div>
          <h1>{g.name}</h1>
          <p>{g.id}</p>
        </div>
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="panel">
          <h2>Stammdaten</h2>
          <p>Gateway-ID: {g.id}</p>
          <p>Externe ID: {g.externalGatewayId}</p>
          <p>Kunde: {g.tenant.name}</p>
          <p>Liegenschaft: {properties.length ? properties.join(", ") : "—"}</p>
          <p>Lifecycle: — (kein Gateway-Lifecycle im Datenmodell)</p>
          <p>Technischer Status: {technicalLabels[g.status] ?? "Unbekannt"}</p>
          <p>Installiert: {utcTime(g.installedAt)}</p>
          <p>Erstellt: {utcTime(g.createdAt)}</p>
        </article>
        <article className="panel">
          <h2>Verbindung</h2>
          <p>
            Verbindung:{" "}
            {g.status === "ONLINE"
              ? "Online"
              : g.status === "OFFLINE"
                ? "Offline"
                : "Unbekannt"}
          </p>
          <p>Letzter Heartbeat: {utcTime(g.lastSeenAt)}</p>
          <p>Health: {healthLabels[health.status] ?? "Unbekannt"}</p>
          <ul>
            {health.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p>Netzwerkadresse: — (nicht gespeichert)</p>
        </article>
        <article className="panel">
          <h2>Software und Hardware</h2>
          <p>Software-/Agentversion: {g.firmwareVersion ?? "—"}</p>
          <p>Hardwareversion: — (nicht gespeichert)</p>
          <p>Zielversion: — (nicht gespeichert)</p>
        </article>
        <article className="panel">
          <h2>Technischer Zustand</h2>
          <p>Queue: {g.queueSize}</p>
          <p>Queue-Warnung: {g.queueWarning ? "Ja" : "Nein"}</p>
          <p>Verworfene Queue-Einträge: {g.queueDropped}</p>
          <p>Quarantäne: {g.quarantineSize}</p>
          <p>Geräte-Health/Compliance:</p>
          {g.devices.map((d) => {
            const c = compliance.find((x) => x.deviceId === d.id);
            return (
              <p key={d.id}>
                {d.name ?? d.externalDeviceId}:{" "}
                {c ? complianceLabels[c.status] : "Unbekannt"}
              </p>
            );
          })}
        </article>
      </section>
      <section className="panel mt-4">
        <h2>Zugeordnete Geräte ({g.devices.length})</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Gerät</th>
                <th>Typ</th>
                <th>Zähler</th>
                <th>Profil</th>
                <th>Lifecycle</th>
                <th>Status</th>
                <th>Letzter Kontakt (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {g.devices.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link
                      className="text-link"
                      href={`/devices/${encodeURIComponent(d.id)}?tenantId=${encodeURIComponent(g.tenantId)}&platformAdmin=1`}
                    >
                      {d.name ?? d.externalDeviceId}
                    </Link>
                    <small className="block">{d.id}</small>
                  </td>
                  <td>{meterLabels[d.meter.type] ?? d.meter.type}</td>
                  <td>{d.meter.serialNumber}</td>
                  <td>
                    {d.profile
                      ? `${d.profile.manufacturer} ${d.profile.model} v${d.profile.version}`
                      : "—"}
                  </td>
                  <td>{lifecycleLabels[d.lifecycleStatus] ?? "Unbekannt"}</td>
                  <td>{technicalLabels[d.status] ?? "Unbekannt"}</td>
                  <td>{utcTime(d.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {g.devices.length === 0 && <p>Keine Geräte zugeordnet.</p>}
        </div>
      </section>
      <section className="panel mt-4">
        <h2>Credentials · Metadaten</h2>
        {credentials.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Fingerprint</th>
                  <th>Erstellt</th>
                  <th>Ablauf</th>
                  <th>Widerrufen</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((c) => (
                  <tr key={c.id}>
                    <td>{credentialLabel(c)}</td>
                    <td>{c.keyFingerprint ?? "—"}</td>
                    <td>{utcTime(c.createdAt)}</td>
                    <td>{utcTime(c.expiresAt)}</td>
                    <td>{utcTime(c.revokedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Keine Credentials vorhanden.</p>
        )}
        <p className="mt-3">
          Private Schlüssel und öffentliche Schlüssel werden hier nicht
          ausgegeben.
        </p>
        <GatewayCredentialActions
          gatewayId={g.id}
          tenantId={g.tenantId}
          credentials={credentials.map((c) => ({ id: c.id, status: c.status }))}
        />
      </section>
      <section className="panel mt-4">
        <h2>Wartung</h2>
        {g.maintenanceWindows.length ? (
          g.maintenanceWindows.map((w) => (
            <p key={w.id}>
              {utcTime(w.startsAt)} – {utcTime(w.endsAt)} · {w.reason}
            </p>
          ))
        ) : (
          <p>Keine Wartungsfenster gespeichert.</p>
        )}
      </section>
      <section className="panel mt-4">
        <h2>Technische Alerts</h2>
        {alerts.length ? (
          alerts.map((a) => (
            <p key={a.id}>
              {utcTime(a.openedAt)} · {a.kind} ·{" "}
              {a.active ? "Aktiv" : "Behoben"}
            </p>
          ))
        ) : (
          <p>Keine technischen Alerts.</p>
        )}
      </section>
      <section className="panel mt-4">
        <h2>Audit-Ereignisse</h2>
        {audit.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Zeit (UTC)</th>
                  <th>Aktion</th>
                  <th>Objekt-ID</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{utcTime(a.createdAt)}</td>
                    <td>{a.action}</td>
                    <td>{a.entityId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Keine passenden Audit-Ereignisse.</p>
        )}
      </section>
    </>
  );
}
