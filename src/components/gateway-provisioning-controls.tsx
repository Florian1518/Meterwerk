"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { utcInput } from "@/lib/format";
import { lifecycleLabels } from "@/lib/gateway-admin";

const failureReasons = {
  INSTALLATION_FAILED: "Installation fehlgeschlagen",
  CONFIGURATION_FAILED: "Konfiguration fehlgeschlagen",
  COMMUNICATION_FAILED: "Kommunikation fehlgeschlagen",
  OPERATOR_ABORTED: "Durch Verantwortlichen abgebrochen",
};
const actionLabels: Record<string, string> = {
  PROVISIONING: "Provisionierung starten / bewusst neu versuchen",
  ACTIVE: "Gateway aktivieren",
  MAINTENANCE: "In Wartung setzen",
  FAILED: "Provisionierung als fehlgeschlagen markieren",
  DECOMMISSIONED: "Gateway endgültig stilllegen",
};
export function GatewayProvisioningControls({
  id,
  tenantId,
  revision,
  lifecycleStatus,
  allowedTransitions,
  properties,
  propertyId,
  canAssignProperty,
  credentials,
  identities,
}: {
  id: string;
  tenantId: string;
  revision: number;
  lifecycleStatus: string;
  allowedTransitions: string[];
  properties: { id: string; name: string }[];
  propertyId: string | null;
  canAssignProperty: boolean;
  credentials: { id: string; status: string }[];
  identities: {
    id: string;
    enabled: boolean;
    requested: boolean;
    revoked: boolean;
    valid: boolean;
  }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reason, setReason] = useState("OPERATOR_ABORTED");
  const terminal = lifecycleStatus === "DECOMMISSIONED";
  async function act(operation: string, data: unknown, confirmation: string) {
    if (!window.confirm(confirmation)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/platform/gateways/${encodeURIComponent(id)}/provisioning`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ tenantId, confirmed: true, operation, data }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Aktion fehlgeschlagen.");
      setMessage("Bestätigung gespeichert. Ansicht wird aktualisiert.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel mt-4 space-y-4"
      aria-label="Provisioning-Aktionen"
    >
      <h2>Provisioning-Aktionen</h2>
      <p>
        Lifecycle: {lifecycleStatus} · {lifecycleLabels[lifecycleStatus]}.
        Online/Offline ist ein separater technischer Zustand.
      </p>
      {terminal && (
        <p>
          <strong>DECOMMISSIONED ist terminal.</strong> Keine erneute
          Aktivierung. Externe Widerrufe können weiterhin bestätigt werden.
        </p>
      )}
      {allowedTransitions.includes("FAILED") && (
        <label>
          Begrenzter Fehlergrund
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(failureReasons).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        {allowedTransitions.map((status) => (
          <Button
            key={status}
            disabled={busy}
            variant="outline"
            onClick={() =>
              void act(
                "LIFECYCLE",
                {
                  status,
                  revision,
                  ...(status === "FAILED" ? { errorCode: reason } : {}),
                },
                status === "DECOMMISSIONED"
                  ? "Gateway endgültig stilllegen? Signaturcredentials werden widerrufen und offene Commands storniert. Der externe Broker-Widerruf muss separat erfolgen. Devices bleiben erhalten."
                  : `${actionLabels[status]}? Die Voraussetzungen werden serverseitig erneut geprüft; keine Infrastrukturaktion wird gestartet.`,
              )
            }
          >
            {actionLabels[status]}
          </Button>
        ))}
        {lifecycleStatus === "PROVISIONING" && (
          <Button
            disabled={busy}
            variant="outline"
            onClick={() =>
              void act(
                "INSTALLATION",
                { revision },
                "Installation dieses Gateways vor Ort tatsächlich durchgeführt und geprüft?",
              )
            }
          >
            Installation vor Ort bestätigt
          </Button>
        )}
      </div>
      {canAssignProperty ? (
        <form
          className="create-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void act(
              "PROPERTY",
              { propertyId: form.get("propertyId"), revision },
              "Direkte Liegenschaft ändern? Ein Installationsnachweis wird dadurch ungültig.",
            );
          }}
        >
          <label>
            Liegenschaft ändern (gleicher Kunde)
            <select
              key={propertyId}
              name="propertyId"
              required
              defaultValue={propertyId ?? ""}
            >
              <option value="">Bitte auswählen</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy}>Liegenschaft zuordnen</Button>
        </form>
      ) : (
        <p>
          Keine einfache Umhängung: Propertywechsel nur in NEW oder MAINTENANCE
          ohne Geräte und offene Commands.
        </p>
      )}
      {["NEW", "PROVISIONING", "MAINTENANCE"].includes(lifecycleStatus) && (
        <form
          className="create-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const expiry = String(form.get("expiresAt") ?? "");
            void act(
              "PUBLIC_KEY",
              {
                publicKey: form.get("publicKey"),
                ...(expiry ? { expiresAt: utcInput(expiry) } : {}),
              },
              "Signatur-Public-Key für dieses Gateway registrieren?",
            );
          }}
        >
          <h3>Signatur-Public-Key registrieren</h3>
          <p>
            Das Gateway erzeugt seinen Ed25519 Private Key lokal. Hier
            ausschließlich den öffentlichen Schlüssel als SPKI-PEM eintragen.
          </p>
          <label>
            Ed25519 Public Key (SPKI-PEM)
            <textarea
              name="publicKey"
              required
              maxLength={256}
              rows={4}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Ablauf (UTC, optional)
            <input name="expiresAt" type="datetime-local" />
          </label>
          <Button disabled={busy}>Signatur-Public-Key registrieren</Button>
        </form>
      )}
      {!terminal &&
        credentials
          .filter((c) => c.status === "ACTIVE")
          .map((c) => (
            <div key={c.id}>
              <span>Signatur-Credential {c.id} </span>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() =>
                  void act(
                    "REVOKE_SIGNATURE",
                    { credentialId: c.id },
                    "Signatur-Credential unwiderruflich widerrufen?",
                  )
                }
              >
                Widerrufen
              </Button>
            </div>
          ))}
      {!terminal && (
        <form
          className="create-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void act(
              "COMMUNICATION_REGISTER",
              {
                brokerReference: form.get("brokerReference"),
                issuerReference: form.get("issuerReference"),
                certificateFingerprint: form.get("certificateFingerprint"),
                serialNumber: form.get("serialNumber"),
                commonName: id,
                notBefore: utcInput(String(form.get("notBefore"))),
                expiresAt: utcInput(String(form.get("expiresAt"))),
              },
              "Öffentliche Zertifikatsmetadaten in Meterwerk registrieren? Dies bestätigt keine Broker-Freischaltung.",
            );
          }}
        >
          <h3>Kommunikationsidentität registrieren</h3>
          <p>
            Öffentliches Inventar; keine Zertifikatsausstellung oder
            Brokersteuerung. Keine privaten Zertifikatsschlüssel eintragen.
          </p>
          <div className="form-grid">
            <label>
              Umgebung / Brokerreferenz
              <input
                name="brokerReference"
                required
                maxLength={160}
                pattern="[A-Za-z0-9][A-Za-z0-9_.:\-]*"
              />
            </label>
            <label>
              Zertifikatsfingerprint (SHA-256, 64 kleine Hex-Zeichen)
              <input
                name="certificateFingerprint"
                required
                pattern="[0-9a-f]{64}"
                maxLength={64}
              />
            </label>
            <label>
              Issuer-Referenz
              <input
                name="issuerReference"
                required
                maxLength={160}
                pattern="[A-Za-z0-9][A-Za-z0-9_.:\-]*"
              />
            </label>
            <label>
              Seriennummer (Hex, klein)
              <input
                name="serialNumber"
                required
                pattern="[0-9a-f]{1,80}"
                maxLength={80}
              />
            </label>
            <label>
              Common Name (interne Gateway-ID)
              <input value={id} readOnly />
            </label>
            <label>
              Gültig ab (UTC)
              <input name="notBefore" type="datetime-local" required />
            </label>
            <label>
              Gültig bis (UTC)
              <input name="expiresAt" type="datetime-local" required />
            </label>
          </div>
          <Button disabled={busy}>In Meterwerk registrieren</Button>
        </form>
      )}
      {identities.map((i) => (
        <div className="space-y-2" key={i.id}>
          <p>Kommunikationsidentität: {i.id}</p>
          {!terminal && i.valid && !i.enabled && !i.requested && !i.revoked && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void act(
                  "COMMUNICATION_CONFIRM",
                  { identityId: i.id, operation: "CONFIRM_ENABLED" },
                  "Wurde die Freischaltung tatsächlich extern am Broker vorgenommen und geprüft? Meterwerk führt keine Brokeraktion aus.",
                )
              }
            >
              Externe Broker-Freischaltung bestätigen
            </Button>
          )}
          {!i.requested && !i.revoked && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void act(
                  "COMMUNICATION_CONFIRM",
                  { identityId: i.id, operation: "REQUEST_REVOCATION" },
                  "Externen Broker-Widerruf als erforderlich vormerken? Er muss außerhalb von Meterwerk ausgeführt werden.",
                )
              }
            >
              Widerruf anfordern
            </Button>
          )}
          {i.requested && !i.revoked && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void act(
                  "COMMUNICATION_CONFIRM",
                  { identityId: i.id, operation: "CONFIRM_REVOKED" },
                  "Wurde der Broker-/Zertifikatszugang tatsächlich extern widerrufen und geprüft?",
                )
              }
            >
              Widerruf extern bestätigen
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
