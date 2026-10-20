import Link from "next/link";
import {
  getAdminGateway,
  requireGatewayAdminPage,
} from "@/server/gateway-admin";
import { GatewayProvisioningControls } from "@/components/gateway-provisioning-controls";
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
    readiness,
    properties,
    allowedTransitions,
    canAssignProperty,
  } = await getAdminGateway(id, query.tenantId);
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
          <p>
            Liegenschaft: {g.property?.name ?? "Keine Liegenschaft zugeordnet"}
          </p>
          <p>
            Lifecycle: {g.lifecycleStatus} ·{" "}
            {lifecycleLabels[g.lifecycleStatus]}
          </p>
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
          <p>Erster Kontakt (UTC): {utcTime(g.firstContactAt)}</p>
          <p>Letzter Kontakt (UTC): {utcTime(g.lastSeenAt)}</p>
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
      </section>
      <section className="panel mt-4">
        <h2>Provisionierung</h2>
        <p>Beginn (UTC): {utcTime(g.provisioningStartedAt)}</p>
        <p>
          Akzeptierter Kontakt im aktuellen Versuch (UTC):{" "}
          {utcTime(readiness.currentContactAt)}
        </p>
        <p>Aktiviert (UTC): {utcTime(g.commissionedAt)}</p>
        <p>
          Fehler: {g.provisioningErrorCode ?? "—"} ·{" "}
          {utcTime(g.provisioningFailedAt)}
        </p>
        <p>
          Ein historisches Installationsdatum ohne Vor-Ort-Bestätigung ist kein
          Installationsnachweis.
        </p>
        <ul>
          {readiness.steps.map((step) => (
            <li key={step.label}>
              {step.label}:{" "}
              {step.status === "FULFILLED" ? "Erfüllt" : "Offen / blockiert"}
            </li>
          ))}
        </ul>
        <p>Aktivierung möglich: {readiness.ready ? "Ja" : "Nein"}</p>
        <ul>
          {readiness.blockers.map((b) => (
            <li key={b.code}>{b.message}</li>
          ))}
        </ul>
      </section>
      <section className="panel mt-4">
        <h2>Kommunikationsidentitäten · öffentliche Metadaten</h2>
        <p>
          In Meterwerk registriert und externe Broker-Freischaltung bestätigt
          sind getrennte Nachweise. Metadaten belegen keine aktive
          MQTT-Verbindung. Alle Zeiten in UTC.
        </p>
        {!g.communicationIdentities.length && (
          <p>Keine Kommunikationsidentität registriert.</p>
        )}
        {g.communicationIdentities.map((i) => (
          <article key={i.id} className="mt-4 break-words">
            <h3>{i.brokerReference}</h3>
            <p>Identität: {i.id}</p>
            <p>Fingerprint: {i.certificateFingerprint}</p>
            <p>
              Issuer: {i.issuerReference} · Seriennummer: {i.serialNumber}
            </p>
            <p>Common Name: {i.commonName}</p>
            <p>
              Gültigkeit: {utcTime(i.notBefore)} – {utcTime(i.expiresAt)}
            </p>
            <p>In Meterwerk registriert: {utcTime(i.registeredAt)}</p>
            <p>
              Externe Broker-Freischaltung bestätigt:{" "}
              {utcTime(i.enabledConfirmedAt)}
            </p>
            <p>
              Broker-/MQTT-Zugang:{" "}
              {i.revocationConfirmedAt
                ? "Widerruf extern bestätigt"
                : i.revocationRequestedAt
                  ? "Widerruf angefordert"
                  : "Widerruf nicht angefordert"}
            </p>
            <p>
              Widerruf angefordert: {utcTime(i.revocationRequestedAt)} · extern
              bestätigt: {utcTime(i.revocationConfirmedAt)}
            </p>
          </article>
        ))}
      </section>
      <section className="panel mt-4">
        <h2>Stilllegung</h2>
        <p>
          Anwendung:{" "}
          {g.lifecycleStatus === "DECOMMISSIONED"
            ? "gesperrt (terminal)"
            : "nicht durch Stilllegung gesperrt"}
        </p>
        <p>
          Gateway-Signaturcredentials:{" "}
          {credentials.some((c) => c.status === "ACTIVE")
            ? "Widerruf offen"
            : credentials.length
              ? "widerrufen"
              : "keine registriert"}
        </p>
        <p>
          Broker-/MQTT-Zugang:{" "}
          {g.communicationIdentities.length === 0
            ? "Kein Inventarnachweis; externer Status unbekannt"
            : g.communicationIdentities.every((i) => i.revocationConfirmedAt)
              ? "Widerruf extern bestätigt"
              : g.communicationIdentities.some(
                    (i) => i.revocationRequestedAt && !i.revocationConfirmedAt,
                  )
                ? "Widerruf angefordert; externe Bestätigung offen"
                : "Widerruf nicht angefordert"}
        </p>
        <p>
          Devices bleiben eigenständig. Ein offline laufender Edge-Agent wird
          nicht physisch ferngestoppt.
        </p>
      </section>
      <GatewayProvisioningControls
        id={g.id}
        tenantId={g.tenantId}
        revision={g.revision}
        lifecycleStatus={g.lifecycleStatus}
        allowedTransitions={allowedTransitions}
        properties={properties}
        propertyId={g.propertyId}
        canAssignProperty={canAssignProperty}
        credentials={credentials.map((c) => ({ id: c.id, status: c.status }))}
        identities={g.communicationIdentities.map((i) => ({
          id: i.id,
          enabled: !!i.enabledConfirmedAt,
          requested: !!i.revocationRequestedAt,
          revoked: !!i.revocationConfirmedAt,
          valid: i.notBefore <= new Date() && i.expiresAt > new Date(),
        }))}
      />
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
