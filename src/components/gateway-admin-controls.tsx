"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { utcInput } from "@/lib/format";
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
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="create-details">
      <summary>Gateway vorbereiten</summary>
      <p>
        Interne Vorbereitung eines Gateway-Datensatzes. Broker-Zugang und
        Hardware werden nicht eingerichtet. Eine Liegenschaft ergibt sich erst
        aus zugeordneten Geräten.
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
            <select name="tenantId" required defaultValue="">
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
        <Button disabled={busy || !tenants.length}>
          {busy ? "Wird vorbereitet …" : "Gateway vorbereiten"}
        </Button>
      </form>
    </details>
  );
}
export function GatewayCredentialActions({
  gatewayId,
  tenantId,
  credentials,
}: {
  gatewayId: string;
  tenantId: string;
  credentials: { id: string; status: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [secret, setSecret] = useState<{
    id: string;
    privateKey: string;
  } | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const clear = () => {
      active.current = false;
      setSecret(null);
    };
    window.addEventListener("pagehide", clear);
    // Hide/clear before internal navigation, including browser history restoration.
    const navigate = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a[href]"))
        clear();
    };
    document.addEventListener("click", navigate, true);
    return () => {
      active.current = false;
      setSecret(null);
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("click", navigate, true);
    };
  }, []);
  async function act(
    operation: "CREATE" | "ROTATE" | "REVOKE",
    credentialId?: string,
  ) {
    setSecret(null);
    setError("");
    setMessage("");
    const question =
      operation === "REVOKE"
        ? "Credential unwiderruflich widerrufen? Das Gateway kann damit keine Daten mehr senden."
        : operation === "ROTATE"
          ? "Credential rotieren? Das bisherige Credential wird sofort widerrufen. Der neue private Schlüssel wird nur einmal angezeigt."
          : "Credential erzeugen? Der private Schlüssel wird nur einmal angezeigt; ein Broker-Zugang wird dadurch nicht eingerichtet.";
    if (!window.confirm(question)) return;
    active.current = true;
    setBusy(true);
    try {
      const result = await post(
        `/api/platform/gateways/${encodeURIComponent(gatewayId)}/credentials`,
        {
          tenantId,
          confirmed: true,
          operation,
          ...(credentialId ? { credentialId } : {}),
          ...(expiresAt && operation !== "REVOKE"
            ? { expiresAt: utcInput(expiresAt) }
            : {}),
        },
      );
      if (active.current) {
        if (result.privateKey)
          setSecret({ id: result.id, privateKey: result.privateKey });
        setMessage(
          operation === "REVOKE"
            ? "Credential widerrufen."
            : "Credential gespeichert. Schlüssel jetzt sicher übernehmen.",
        );
      }
      router.refresh();
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <label>
        Ablaufdatum (UTC, optional)
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
      </label>
      <Button type="button" disabled={busy} onClick={() => void act("CREATE")}>
        Credential erzeugen
      </Button>
      {credentials
        .filter((c) => c.status === "ACTIVE")
        .map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3">
            <span className="break-all">{c.id}</span>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void act("ROTATE", c.id)}
            >
              Rotieren
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-red-700"
              disabled={busy}
              onClick={() => void act("REVOKE", c.id)}
            >
              Unwiderruflich widerrufen
            </Button>
          </div>
        ))}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {secret && (
        <section className="panel" aria-label="Einmaliger privater Schlüssel">
          <h3>Dieser private Schlüssel wird nur einmal angezeigt.</h3>
          <p>Nach dem Verlassen oder Neuladen ist er nicht erneut abrufbar.</p>
          <p>Credential-ID: {secret.id}</p>
          <label>
            Privater Schlüssel
            <textarea
              readOnly
              rows={6}
              value={secret.privateKey}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSecret(null)}
          >
            Schlüssel ausblenden
          </Button>
        </section>
      )}
    </div>
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
