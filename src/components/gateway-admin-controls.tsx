"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
async function post(url: string, data: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Aktion fehlgeschlagen.");
  return body;
}
export function PrepareGateway({
  tenants,
}: {
  tenants: { id: string; name: string }[];
}) {
  const [tenantId, setTenantId] = useState("");
  const [properties, setProperties] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    if (!tenantId) return;
    fetch(
      "/api/platform/gateways/properties?tenantId=" +
        encodeURIComponent(tenantId),
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        return body;
      })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setProperties(rows);
        setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [tenantId]);
  return (
    <details className="create-details">
      <summary>Gateway vorbereiten</summary>
      <p>
        Interne Vorbereitung eines Gateway-Datensatzes. Broker-Zugang und
        Hardware werden nicht eingerichtet. Wählen Sie die direkte Liegenschaft
        des Kunden.
      </p>
      <form
        className="create-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          const tenantId = String(form.get("tenantId"));
          try {
            const result = await post(
              `/api/gateways?tenantId=${encodeURIComponent(tenantId)}&platformAdmin=1`,
              {
                name: form.get("name"),
                propertyId: form.get("propertyId"),
                manufacturer: form.get("manufacturer"),
                model: form.get("model"),
                externalGatewayId: form.get("externalGatewayId"),
              },
            );
            router.push(
              `/platform-admin/gateways/${encodeURIComponent(result.id)}?tenantId=${encodeURIComponent(tenantId)}`,
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Kunde
            <select
              name="tenantId"
              required
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value);
                setProperties([]);
                setLoading(true);
                setError("");
              }}
            >
              <option value="" disabled>
                Bitte auswählen
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Liegenschaft
            <select
              key={tenantId}
              name="propertyId"
              required
              defaultValue=""
              disabled={loading || !properties.length}
            >
              <option value="">
                {loading ? "Wird geladen …" : "Bitte auswählen"}
              </option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {tenantId && !loading && !properties.length && (
              <small>Keine Liegenschaften für diesen Kunden vorhanden.</small>
            )}
          </label>
          <label>
            Hersteller
            <input name="manufacturer" required maxLength={160} />
          </label>
          <label>
            Modell
            <input name="model" required maxLength={160} />
          </label>
          <label>
            Name
            <input name="name" required maxLength={160} />
          </label>
          <label>
            Externe Gateway-ID
            <input
              name="externalGatewayId"
              required
              maxLength={80}
              pattern="[A-Za-z0-9_-]+"
            />
            <small>Buchstaben, Ziffern, Unterstrich oder Bindestrich.</small>
          </label>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Button disabled={busy || loading || !properties.length}>
          {busy ? "Wird vorbereitet …" : "Gateway vorbereiten"}
        </Button>
      </form>
    </details>
  );
}
export function DecommissionDevice({
  deviceId,
  tenantId,
}: {
  deviceId: string;
  tenantId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="panel">
      <h2>Gerät stilllegen</h2>
      <p>
        Die Stilllegung ist endgültig. Aktive Device-Tokens werden widerrufen
        und die serverseitige Datenannahme wird gesperrt.
      </p>
      <Button
        variant="outline"
        className="text-red-700"
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm(
              "Gerät endgültig stilllegen und aktive Device-Tokens widerrufen?",
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            await post(
              `/api/platform/devices/${encodeURIComponent(deviceId)}/lifecycle`,
              { tenantId, status: "DECOMMISSIONED", confirmed: true },
            );
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Gerät endgültig stilllegen
      </Button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
