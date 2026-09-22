"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/button";

const events = [
  "meter.reading.received",
  "meter.offline",
  "meter.online",
  "gateway.offline",
  "gateway.online",
  "alarm.created",
  "alarm.acknowledged",
  "alarm.resolved",
  "report.ready",
] as const;
type Endpoint = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastDeliveryAt: string | null;
};
type Delivery = {
  id: string;
  webhookId: string;
  event: string;
  status: string;
  attempts: number;
  statusCode: number | null;
  error: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
};

export function Webhooks({ tenantId }: { tenantId: string }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "meter.reading.received",
  ]);
  const [secret, setSecret] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch(
      `/api/webhooks?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: "no-store" },
    );
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error ?? "Webhooks konnten nicht geladen werden.");
    setEndpoints(body.endpoints);
    setDeliveries(body.deliveries);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(
          `/api/webhooks?tenantId=${encodeURIComponent(tenantId)}`,
          { cache: "no-store" },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error ?? "Webhooks konnten nicht geladen werden.",
          );
        if (active) {
          setEndpoints(body.endpoints);
          setDeliveries(body.deliveries);
        }
      } catch (error) {
        if (active)
          setMessage(
            error instanceof Error ? error.message : "Laden fehlgeschlagen.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [tenantId]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSecret("");
    setMessage("");
    try {
      const response = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          name,
          url,
          events: selectedEvents,
          active: true,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Webhook konnte nicht erstellt werden.");
      setSecret(body.secret);
      setName("");
      setUrl("");
      setMessage(
        "Webhook angelegt. Das Signatur-Secret wird nur jetzt angezeigt.",
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

  async function toggle(endpoint: Endpoint) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/webhooks/${encodeURIComponent(endpoint.id)}?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ active: !endpoint.active }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Webhook konnte nicht geändert werden.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ändern fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(endpoint: Endpoint) {
    if (!window.confirm(`Webhook „${endpoint.name}“ löschen?`)) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/webhooks/${encodeURIComponent(endpoint.id)}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: "DELETE" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Webhook konnte nicht gelöscht werden.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Löschen fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/webhooks/${encodeURIComponent(editingId)}?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: editName,
            url: editUrl,
            events: editEvents,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "Webhook konnte nicht gespeichert werden.",
        );
      setEditingId(null);
      setMessage("Webhook-Konfiguration gespeichert.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(endpoint: Endpoint) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/webhooks/${encodeURIComponent(endpoint.id)}/test?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "Testzustellung konnte nicht angelegt werden.",
        );
      setMessage(`Testzustellung ${body.deliveryId} wurde eingereiht.`);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Testzustellung fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Webhook erstellen</h2>
        {message && (
          <p role="status" className="toast">
            {message}
          </p>
        )}
        {secret && (
          <div role="alert">
            <label htmlFor="webhook-secret">
              Signatur-Secret – jetzt sicher speichern
            </label>
            <input
              id="webhook-secret"
              readOnly
              value={secret}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button variant="outline" onClick={() => setSecret("")}>
              Ausblenden
            </Button>
          </div>
        )}
        <form className="form-grid" onSubmit={create}>
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
            HTTPS-Endpunkt
            <input
              required
              type="url"
              maxLength={2000}
              placeholder="https://example.com/hooks/meterwerk"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <fieldset>
            <legend>Ereignisse</legend>
            <div className="feature-grid">
              {events.map((item) => (
                <label key={item}>
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(item)}
                    onChange={(event) =>
                      setSelectedEvents((current) =>
                        event.target.checked
                          ? [...current, item]
                          : current.filter((value) => value !== item),
                      )
                    }
                  />{" "}
                  {item}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={busy || selectedEvents.length === 0}>
            Webhook erstellen
          </Button>
        </form>
      </section>
      <section className="panel">
        <h2>Konfigurationen</h2>
        {endpoints.length === 0 ? (
          <p>Noch keine Webhooks konfiguriert.</p>
        ) : (
          endpoints.map((endpoint) => (
            <div key={endpoint.id}>
              <article className="list-row">
                <div>
                  <strong>{endpoint.name}</strong>
                  <p>
                    <code>{endpoint.url}</code>
                  </p>
                  <small>
                    {endpoint.events.join(", ")} ·{" "}
                    {endpoint.active ? "Aktiv" : "Inaktiv"}
                  </small>
                  <p>
                    <small>
                      Erstellt{" "}
                      {new Date(endpoint.createdAt).toLocaleString("de-DE")} ·
                      letzte Zustellung{" "}
                      {endpoint.lastDeliveryAt
                        ? new Date(endpoint.lastDeliveryAt).toLocaleString(
                            "de-DE",
                          )
                        : "noch keine"}
                    </small>
                  </p>
                </div>
                <div className="actions">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(endpoint.id);
                      setEditName(endpoint.name);
                      setEditUrl(endpoint.url);
                      setEditEvents(endpoint.events);
                    }}
                  >
                    Bearbeiten
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !endpoint.active}
                    onClick={() => void sendTest(endpoint)}
                  >
                    Test senden
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void toggle(endpoint)}
                  >
                    {endpoint.active ? "Deaktivieren" : "Aktivieren"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void remove(endpoint)}
                  >
                    Löschen
                  </Button>
                </div>
              </article>
              {editingId === endpoint.id && (
                <form className="form-grid" onSubmit={saveEdit}>
                  <h3>Webhook bearbeiten: {endpoint.name}</h3>
                  <label>
                    Name
                    <input
                      required
                      maxLength={120}
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                  </label>
                  <label>
                    HTTPS-Endpunkt
                    <input
                      required
                      type="url"
                      maxLength={2000}
                      value={editUrl}
                      onChange={(event) => setEditUrl(event.target.value)}
                    />
                  </label>
                  <fieldset>
                    <legend>Ereignisse</legend>
                    <div className="feature-grid">
                      {events.map((item) => (
                        <label key={item}>
                          <input
                            type="checkbox"
                            checked={editEvents.includes(item)}
                            onChange={(event) =>
                              setEditEvents((current) =>
                                event.target.checked
                                  ? [...current, item]
                                  : current.filter((value) => value !== item),
                              )
                            }
                          />{" "}
                          {item}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="actions">
                    <Button
                      type="submit"
                      disabled={busy || editEvents.length === 0}
                    >
                      Änderungen speichern
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ))
        )}
      </section>
      <section className="panel">
        <h2>Letzte Zustellungen</h2>
        {deliveries.length === 0 ? (
          <p>Noch keine Zustellungen.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Ereignis</th>
                  <th scope="col">Zuletzt versucht</th>
                  <th scope="col">Status</th>
                  <th scope="col">Versuche</th>
                  <th scope="col">HTTP</th>
                  <th scope="col">Fehler</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>
                      {delivery.event}
                      <br />
                      <small>{delivery.id}</small>
                    </td>
                    <td>
                      {delivery.lastAttemptAt
                        ? new Date(delivery.lastAttemptAt).toLocaleString(
                            "de-DE",
                          )
                        : "–"}
                    </td>
                    <td>{delivery.status}</td>
                    <td>{delivery.attempts}</td>
                    <td>{delivery.statusCode ?? "–"}</td>
                    <td>{delivery.error ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
