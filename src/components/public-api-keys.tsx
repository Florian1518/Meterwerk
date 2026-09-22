"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";

const scopes = [
  "properties:read",
  "buildings:read",
  "units:read",
  "meters:read",
  "readings:read",
  "alarms:read",
  "reports:read",
] as const;
type ApiKey = {
  id: string;
  name: string;
  description: string | null;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function PublicApiKeys({ tenantId }: { tenantId: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "properties:read",
    "meters:read",
  ]);
  const [expiresAt, setExpiresAt] = useState("");
  const [revealedKey, setRevealedKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/api-keys?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: "no-store" },
    );
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error ?? "API-Keys konnten nicht geladen werden.");
    setKeys(body);
  }, [tenantId]);
  useEffect(() => {
    let active = true;
    async function loadInitialKeys() {
      try {
        const response = await fetch(
          `/api/api-keys?tenantId=${encodeURIComponent(tenantId)}`,
          { cache: "no-store" },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error ?? "API-Keys konnten nicht geladen werden.",
          );
        if (active) setKeys(body);
      } catch (error) {
        if (active)
          setMessage(
            error instanceof Error ? error.message : "Laden fehlgeschlagen.",
          );
      }
    }
    void loadInitialKeys();
    return () => {
      active = false;
    };
  }, [tenantId]);
  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setRevealedKey("");
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          name,
          description: description || null,
          scopes: selectedScopes,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "API-Key konnte nicht erstellt werden.");
      setRevealedKey(body.token);
      setName("");
      setDescription("");
      setExpiresAt("");
      setMessage(
        "API-Key erstellt. Kopiere ihn jetzt; er wird nur einmal vollständig angezeigt.",
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Erstellen fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/api-keys?id=${encodeURIComponent(id)}&tenantId=${encodeURIComponent(tenantId)}`,
        { method: "DELETE" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "API-Key konnte nicht widerrufen werden.",
        );
      await load();
      setMessage("API-Key widerrufen.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Widerruf fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <h2>Public API-Key erstellen</h2>
        {message && (
          <p role="status" className="toast">
            {message}
          </p>
        )}
        {revealedKey && (
          <div role="alert">
            <label htmlFor="new-public-api-key">
              Vollständiger API-Key – jetzt sicher kopieren
            </label>
            <input
              id="new-public-api-key"
              readOnly
              value={revealedKey}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button variant="outline" onClick={() => setRevealedKey("")}>
              Ausblenden
            </Button>
          </div>
        )}
        <form className="form-grid" onSubmit={createKey}>
          <label>
            Name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Beschreibung
            <input
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            Ablaufdatum (optional)
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </label>
          <fieldset>
            <legend>Berechtigungen (Scopes)</legend>
            <div className="feature-grid">
              {scopes.map((scope) => (
                <label key={scope}>
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope)}
                    onChange={(event) =>
                      setSelectedScopes((current) =>
                        event.target.checked
                          ? [...current, scope]
                          : current.filter((value) => value !== scope),
                      )
                    }
                  />{" "}
                  {scope}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={busy || !selectedScopes.length}>
            API-Key erstellen
          </Button>
        </form>
      </section>
      <section className="panel">
        <h2>Vorhandene API-Keys</h2>
        <p>
          Es werden nur Metadaten angezeigt. Gespeichert wird ausschließlich ein
          Hash; widerrufene Keys bleiben als Audit-Nachweis sichtbar.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption>Tenant-gebundene Public API-Keys</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Scopes</th>
                <th scope="col">Erstellt</th>
                <th scope="col">Ablauf</th>
                <th scope="col">Zuletzt genutzt</th>
                <th scope="col">Status / Aktion</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <th scope="row">
                    {key.name}
                    <br />
                    {key.description}
                  </th>
                  <td>{key.scopes.join(", ")}</td>
                  <td>{new Date(key.createdAt).toLocaleDateString("de-DE")}</td>
                  <td>
                    {key.expiresAt
                      ? new Date(key.expiresAt).toLocaleDateString("de-DE")
                      : "Kein Ablaufdatum"}
                  </td>
                  <td>
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleString("de-DE")
                      : "Noch nicht genutzt"}
                  </td>
                  <td>
                    {key.revokedAt ? (
                      "Widerrufen"
                    ) : (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void revoke(key.id)}
                      >
                        Widerrufen
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
