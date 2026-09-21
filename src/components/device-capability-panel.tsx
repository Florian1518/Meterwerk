type Capability = {
  utility: string;
  protocol: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  profile: {
    id: string;
    version: number;
    capabilities: unknown;
    firmwareNotes: string | null;
  } | null;
  protocolMode: string;
  signal: {
    deviceIdValue: string;
    manufacturerCode: string;
    securityMode: string;
    rssi: number | null;
    snr: unknown;
    receivedAt: Date | null;
  } | null;
  lastContact: string | null;
  status: string;
};
export function DeviceCapabilityPanel({
  capability,
}: {
  capability: Capability | null;
}) {
  if (!capability)
    return (
      <section className="panel">
        <h2>Geräteprofil</h2>
        <p>Noch kein Kommunikationsgerät zugeordnet.</p>
      </section>
    );
  const metrics = Array.isArray(capability.profile?.capabilities)
    ? capability.profile?.capabilities.join(", ")
    : "Keine Profilmessgrößen hinterlegt";
  return (
    <section className="panel">
      <h2>Geräteprofil und Kommunikation</h2>
      <dl className="meter-details">
        <div>
          <dt>Medium / Protokoll</dt>
          <dd>
            {capability.utility} · {capability.protocol} ·{" "}
            {capability.protocolMode}
          </dd>
        </div>
        <div>
          <dt>Hersteller / Modell</dt>
          <dd>
            {capability.manufacturer} · {capability.model}
          </dd>
        </div>
        <div>
          <dt>Seriennummer</dt>
          <dd>{capability.serialNumber}</dd>
        </div>
        <div>
          <dt>Profil</dt>
          <dd>
            {capability.profile
              ? `${capability.profile.id} · Version ${capability.profile.version}`
              : "Nicht zugeordnet"}
          </dd>
        </div>
        <div>
          <dt>Messgrößen</dt>
          <dd>{metrics}</dd>
        </div>
        <div>
          <dt>Kommunikation</dt>
          <dd>
            {capability.status} · letzter Kontakt{" "}
            {capability.lastContact ?? "—"}
          </dd>
        </div>
        {capability.signal && (
          <div>
            <dt>Signal</dt>
            <dd>
              {capability.signal.deviceIdValue} ·{" "}
              {capability.signal.securityMode} · RSSI{" "}
              {capability.signal.rssi ?? "—"} · SNR{" "}
              {String(capability.signal.snr ?? "—")}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
